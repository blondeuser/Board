// SQLite storage core (docs/RUST_BACKEND.md step 1). No Tauri types here, so `cargo test` covers it.
// shortcut: boards, assets, placements, connections and categories are stored as JSON documents (same camelCase shape
// as src/shared/types.ts) with only the id / foreign-key columns split out; split more columns when a query needs them.
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde_json::Value;
use std::path::Path;

type Res<T> = Result<T, String>;

fn e(err: rusqlite::Error) -> String {
    err.to_string()
}

/// Numbered migrations, applied in order; never edit an old one. `PRAGMA user_version` = how many have run.
const MIGRATIONS: &[&str] = &["
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE boards (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE assets (id TEXT PRIMARY KEY, hash TEXT, data TEXT NOT NULL);
CREATE INDEX assets_hash ON assets(hash);
CREATE TABLE placements (
  id TEXT PRIMARY KEY, board_id TEXT NOT NULL, asset_id TEXT, data TEXT NOT NULL);
CREATE INDEX placements_board ON placements(board_id);
CREATE INDEX placements_asset ON placements(asset_id);
CREATE TABLE connections (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, data TEXT NOT NULL);
CREATE INDEX connections_board ON connections(board_id);
CREATE TABLE categories (id TEXT PRIMARY KEY, data TEXT NOT NULL);
", "
CREATE TABLE embeddings (asset_id TEXT PRIMARY KEY, model TEXT NOT NULL, vec BLOB NOT NULL);
"];

pub struct Db(Connection);

impl Db {
    pub fn open(path: &Path) -> Res<Db> {
        Self::init(Connection::open(path).map_err(e)?)
    }

    #[cfg(test)]
    pub fn memory() -> Res<Db> {
        Self::init(Connection::open_in_memory().map_err(e)?)
    }

    fn init(mut c: Connection) -> Res<Db> {
        c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").map_err(e)?;
        let done: usize = c.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
        if done > MIGRATIONS.len() {
            return Err("library was written by a newer version of REMind".into());
        }
        for (i, sql) in MIGRATIONS.iter().enumerate().skip(done) {
            let t = c.transaction().map_err(e)?;
            t.execute_batch(sql).map_err(e)?;
            t.execute_batch(&format!("PRAGMA user_version={}", i + 1)).map_err(e)?;
            t.commit().map_err(e)?;
        }
        Ok(Db(c))
    }

    fn tx<T>(&mut self, f: impl FnOnce(&Transaction) -> Res<T>) -> Res<T> {
        let t = self.0.transaction().map_err(e)?;
        let out = f(&t)?;
        t.commit().map_err(e)?;
        Ok(out)
    }

    /// Everything the UI needs at start, one call: { boards, assets, placements, connections, categories }.
    pub fn load_all(&self) -> Res<Value> {
        let mut out = serde_json::Map::new();
        for table in ["boards", "assets", "placements", "connections", "categories"] {
            let mut st = self.0.prepare(&format!("SELECT data FROM {table}")).map_err(e)?;
            let rows = st.query_map([], |r| r.get::<_, String>(0)).map_err(e)?;
            let mut list = Vec::new();
            for row in rows {
                list.push(serde_json::from_str::<Value>(&row.map_err(e)?).map_err(|x| x.to_string())?);
            }
            out.insert(table.into(), Value::Array(list));
        }
        Ok(Value::Object(out))
    }

    /// An existing image with this content hash (duplicate import check).
    pub fn find_by_hash(&self, hash: &str) -> Res<Option<Value>> {
        let s: Option<String> = self.0.query_row("SELECT data FROM assets WHERE hash=?1 LIMIT 1", [hash], |r| r.get(0)).optional().map_err(e)?;
        s.map(|s| serde_json::from_str(&s).map_err(|x| x.to_string())).transpose()
    }

    pub fn save_boards(&mut self, v: &[Value]) -> Res<()> {
        self.put(v, "INSERT OR REPLACE INTO boards (id, data) VALUES (?1, ?2)", |_| Ok(vec![]))
    }
    /// An `embedding` array in a document (old libraries, the browser backend) is moved to the embeddings table: vectors
    /// never live in the JSON. Returns true when any were moved (the in-memory search index is then stale).
    pub fn save_assets(&mut self, v: &[Value]) -> Res<bool> {
        let mut moved = false;
        let mut docs = Vec::with_capacity(v.len());
        for d in v {
            let mut d = d.clone();
            if let Some(Value::Array(a)) = d.as_object_mut().and_then(|o| o.remove("embedding")) {
                let vec: Vec<f32> = a.iter().filter_map(|x| x.as_f64().map(|f| f as f32)).collect();
                let (id, model) = (req_str(&d, "id")?, opt_str(&d, "embeddingModel"));
                if let (false, Some(model)) = (vec.is_empty(), model) {
                    self.put_embedding(&id, &model, &vec)?;
                    moved = true;
                }
            }
            docs.push(d);
        }
        self.put(&docs, "INSERT OR REPLACE INTO assets (id, data, hash) VALUES (?1, ?2, ?3)", |d| Ok(vec![opt_str(d, "hash")]))?;
        Ok(moved)
    }

    pub fn put_embedding(&self, id: &str, model: &str, vec: &[f32]) -> Res<()> {
        let blob: Vec<u8> = vec.iter().flat_map(|f| f.to_le_bytes()).collect();
        self.0.execute("INSERT OR REPLACE INTO embeddings (asset_id, model, vec) VALUES (?1, ?2, ?3)", params![id, model, blob]).map_err(e)?;
        Ok(())
    }

    /// Every stored embedding made by `model`.
    pub fn embeddings(&self, model: &str) -> Res<Vec<(String, Vec<f32>)>> {
        let mut st = self.0.prepare("SELECT asset_id, vec FROM embeddings WHERE model=?1").map_err(e)?;
        let rows = st.query_map([model], |r| Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?))).map_err(e)?;
        rows.map(|r| r.map_err(e).map(|(id, b)| (id, b.chunks_exact(4).map(|c| f32::from_le_bytes(c.try_into().unwrap())).collect()))).collect()
    }
    pub fn save_placements(&mut self, v: &[Value]) -> Res<()> {
        self.put(v, "INSERT OR REPLACE INTO placements (id, data, board_id, asset_id) VALUES (?1, ?2, ?3, ?4)", |d| {
            Ok(vec![Some(req_str(d, "boardId")?), opt_str(d, "assetId").filter(|s| !s.is_empty())])
        })
    }
    pub fn save_connections(&mut self, v: &[Value]) -> Res<()> {
        self.put(v, "INSERT OR REPLACE INTO connections (id, data, board_id) VALUES (?1, ?2, ?3)", |d| {
            Ok(vec![Some(req_str(d, "boardId")?)])
        })
    }
    pub fn save_categories(&mut self, v: &[Value]) -> Res<()> {
        self.put(v, "INSERT OR REPLACE INTO categories (id, data) VALUES (?1, ?2)", |_| Ok(vec![]))
    }

    /// Upserts documents: params are (id, json, extras...).
    fn put(&mut self, docs: &[Value], sql: &str, extras: impl Fn(&Value) -> Res<Vec<Option<String>>>) -> Res<()> {
        self.tx(|t| {
            let mut st = t.prepare_cached(sql).map_err(e)?;
            for d in docs {
                let mut p: Vec<Option<String>> = vec![Some(req_str(d, "id")?), Some(d.to_string())];
                p.extend(extras(d)?);
                st.execute(rusqlite::params_from_iter(p)).map_err(e)?;
            }
            Ok(())
        })
    }

    /// Deleting a board removes its placements and lines; images stay in the library.
    pub fn delete_board(&mut self, id: &str) -> Res<()> {
        self.tx(|t| {
            t.execute("DELETE FROM connections WHERE board_id=?1", [id]).map_err(e)?;
            t.execute("DELETE FROM placements WHERE board_id=?1", [id]).map_err(e)?;
            t.execute("DELETE FROM boards WHERE id=?1", [id]).map_err(e)?;
            Ok(())
        })
    }

    /// Deleting an image removes its placements everywhere (and the lines that touch them).
    pub fn delete_assets(&mut self, ids: &[String]) -> Res<()> {
        self.tx(|t| {
            for id in ids {
                let mut st = t.prepare_cached("SELECT id FROM placements WHERE asset_id=?1").map_err(e)?;
                let pids: Vec<String> = st.query_map([id], |r| r.get(0)).map_err(e)?.collect::<Result<_, _>>().map_err(e)?;
                for p in pids {
                    t.execute("DELETE FROM connections WHERE json_extract(data,'$.from')=?1 OR json_extract(data,'$.to')=?1", [&p]).map_err(e)?;
                }
                t.execute("DELETE FROM placements WHERE asset_id=?1", [id]).map_err(e)?;
                t.execute("DELETE FROM assets WHERE id=?1", [id]).map_err(e)?;
                t.execute("DELETE FROM embeddings WHERE asset_id=?1", [id]).map_err(e)?;
            }
            Ok(())
        })
    }

    pub fn delete_placements(&mut self, ids: &[String]) -> Res<()> {
        self.delete_ids("placements", ids)
    }
    pub fn delete_connections(&mut self, ids: &[String]) -> Res<()> {
        self.delete_ids("connections", ids)
    }
    pub fn delete_category(&mut self, id: &str) -> Res<()> {
        self.delete_ids("categories", &[id.to_string()])
    }

    fn delete_ids(&mut self, table: &str, ids: &[String]) -> Res<()> {
        self.tx(|t| {
            for id in ids {
                t.execute(&format!("DELETE FROM {table} WHERE id=?1"), [id]).map_err(e)?;
            }
            Ok(())
        })
    }

    pub fn clear_all(&mut self) -> Res<()> {
        self.tx(|t| {
            for table in ["boards", "assets", "placements", "connections", "categories", "embeddings"] {
                t.execute(&format!("DELETE FROM {table}"), []).map_err(e)?;
            }
            Ok(())
        })
    }

    pub fn meta_get(&self, key: &str) -> Res<Option<String>> {
        self.0.query_row("SELECT value FROM meta WHERE key=?1", [key], |r| r.get(0)).optional().map_err(e)
    }
    pub fn meta_set(&self, key: &str, value: &str) -> Res<()> {
        self.0.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?1, ?2)", params![key, value]).map_err(e)?;
        Ok(())
    }
}

fn req_str(d: &Value, k: &str) -> Res<String> {
    d.get(k).and_then(Value::as_str).map(String::from).ok_or_else(|| format!("missing string field '{k}'"))
}
fn opt_str(d: &Value, k: &str) -> Option<String> {
    d.get(k).and_then(Value::as_str).map(String::from)
}


// Storage move support (docs/STORAGE.md): consistent copy of the open database, and checks on the copy.
impl Db {
    /// Copies the whole database to `dest` with SQLite's online backup (safe while open, unlike copying the file).
    pub fn backup_to(&self, dest: &Path) -> Res<()> {
        let mut out = Connection::open(dest).map_err(e)?;
        let b = rusqlite::backup::Backup::new(&self.0, &mut out).map_err(e)?;
        b.run_to_completion(256, std::time::Duration::ZERO, None).map_err(e)
    }
    /// `PRAGMA integrity_check` says ok.
    pub fn integrity_ok(&self) -> Res<bool> {
        let r: String = self.0.query_row("PRAGMA integrity_check", [], |r| r.get(0)).map_err(e)?;
        Ok(r == "ok")
    }
    /// Row counts of the data tables, in a fixed order (to compare a copy with its source).
    pub fn row_counts(&self) -> Res<Vec<i64>> {
        ["boards", "assets", "placements", "connections", "categories", "embeddings"]
            .iter()
            .map(|t| self.0.query_row(&format!("SELECT COUNT(*) FROM {t}"), [], |r| r.get(0)).map_err(e))
            .collect()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn seeded() -> Db {
        let mut db = Db::memory().unwrap();
        db.save_boards(&[json!({"id":"b1","name":"One"}), json!({"id":"b2","name":"Two"})]).unwrap();
        db.save_assets(&[json!({"id":"a1","hash":"h1"}), json!({"id":"a2"})]).unwrap();
        db.save_placements(&[
            json!({"id":"p1","boardId":"b1","assetId":"a1"}),
            json!({"id":"p2","boardId":"b2","assetId":"a1"}),
            json!({"id":"p3","boardId":"b1","assetId":"a2"}),
            json!({"id":"n1","boardId":"b1","assetId":"","kind":"note"}),
        ])
        .unwrap();
        db.save_connections(&[json!({"id":"c1","boardId":"b1","from":"p1","to":"p3"}), json!({"id":"c2","boardId":"b1","from":"p3","to":"n1"})])
            .unwrap();
        db
    }

    fn count(db: &Db, key: &str) -> usize {
        db.load_all().unwrap()[key].as_array().unwrap().len()
    }

    #[test]
    fn round_trip_keeps_documents() {
        let db = seeded();
        let all = db.load_all().unwrap();
        assert_eq!(all["boards"].as_array().unwrap().len(), 2);
        assert!(all["placements"].as_array().unwrap().contains(&json!({"id":"p1","boardId":"b1","assetId":"a1"})));
    }

    #[test]
    fn save_replaces_by_id() {
        let mut db = seeded();
        db.save_boards(&[json!({"id":"b1","name":"Renamed"})]).unwrap();
        assert_eq!(count(&db, "boards"), 2);
        assert!(db.load_all().unwrap()["boards"].as_array().unwrap().contains(&json!({"id":"b1","name":"Renamed"})));
    }

    #[test]
    fn deleting_a_board_keeps_its_images() {
        let mut db = seeded();
        db.delete_board("b1").unwrap();
        assert_eq!((count(&db, "boards"), count(&db, "placements"), count(&db, "connections"), count(&db, "assets")), (1, 1, 0, 2));
    }

    #[test]
    fn deleting_an_asset_drops_placements_everywhere_and_touching_lines() {
        let mut db = seeded();
        db.delete_assets(&["a1".into()]).unwrap();
        assert_eq!((count(&db, "assets"), count(&db, "placements"), count(&db, "connections")), (1, 2, 1));
    }

    #[test]
    fn embeddings_leave_the_json_and_follow_their_asset() {
        let mut db = Db::memory().unwrap();
        let moved = db.save_assets(&[json!({"id":"a1","embeddingModel":"m1","embedding":[0.5,-1.0]}), json!({"id":"a2"})]).unwrap();
        assert!(moved);
        assert!(db.load_all().unwrap()["assets"].as_array().unwrap().iter().all(|a| a.get("embedding").is_none()));
        assert_eq!(db.embeddings("m1").unwrap(), vec![("a1".to_string(), vec![0.5, -1.0])]);
        assert!(db.embeddings("other").unwrap().is_empty());
        db.delete_assets(&["a1".into()]).unwrap();
        assert!(db.embeddings("m1").unwrap().is_empty());
    }

    #[test]
    fn missing_id_is_an_error_not_a_panic() {
        let mut db = Db::memory().unwrap();
        assert!(db.save_boards(&[json!({"name":"no id"})]).is_err());
    }

    #[test]
    fn migrations_run_once_and_data_survives_reopen() {
        let dir = std::env::temp_dir().join(format!("remind-db-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("board.sqlite");
        {
            let mut db = Db::open(&path).unwrap();
            db.save_boards(&[json!({"id":"b1"})]).unwrap();
            db.meta_set("idb_migrated", "1").unwrap();
        }
        let db = Db::open(&path).unwrap();
        assert_eq!(count(&db, "boards"), 1);
        assert_eq!(db.meta_get("idb_migrated").unwrap().as_deref(), Some("1"));
        std::fs::remove_dir_all(dir).ok();
    }
}
