// `.bo` board files (docs/BO_FORMAT.md, docs/RUST_BACKEND.md step 4): a ZIP with manifest.json, board.json, assets.json,
// categories.json and images/<sha256>.<ext>. Port of src/storage/bo/{write,read}.ts; files written by either side must open
// in the other. No Tauri types, so `cargo test` covers it.
use serde_json::{json, Map, Value};
use std::{
    collections::{hash_map::RandomState, HashMap, HashSet},
    hash::{BuildHasher, Hasher},
    io::{Read, Seek, Write},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub const FORMAT: &str = "remstudio-board";
/// Highest formatVersion this app reads. Boards with ink or text are written as 2, all others as 1 (older apps open those).
pub const MAX_VERSION: u64 = 2;

/// Parsed or to-be-written board. Assets carry `hash` and `ext` (the image file's name inside the zip).
#[derive(Debug)]
pub struct Content {
    pub board: Value,
    pub placements: Vec<Value>,
    pub assets: Vec<Value>,
    pub categories: Vec<Value>,
}

fn s<'a>(v: &'a Value, k: &str) -> &'a str {
    v[k].as_str().unwrap_or("")
}

/// A random UUID-shaped id (same look as the UI's `crypto.randomUUID()`), without a rand crate: `RandomState` is OS-seeded.
pub fn new_id() -> String {
    let rnd = || RandomState::new().build_hasher().finish();
    let (a, b) = (rnd(), rnd());
    let hex = format!("{a:016x}{b:016x}");
    format!("{}-{}-4{}-a{}-{}", &hex[0..8], &hex[8..12], &hex[13..16], &hex[17..20], &hex[20..32])
}

fn needs_v2(placements: &[Value]) -> bool {
    placements.iter().any(|p| matches!(s(p, "kind"), "ink" | "text"))
}

/// Writes the zip. `image(hash, ext)` returns an original's bytes; each hash is stored once, uncompressed. JSON is deflated.
pub fn write<W: Write + Seek>(
    out: W,
    c: &Content,
    app_version: &str,
    exported_at: &str,
    mut image: impl FnMut(&str, &str) -> Result<Vec<u8>, String>,
) -> Result<(), String> {
    let e = |x: zip::result::ZipError| x.to_string();
    let io = |x: std::io::Error| x.to_string();
    let deflate = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let manifest = json!({
        "format": FORMAT,
        "formatVersion": if needs_v2(&c.placements) { 2 } else { 1 },
        "appVersion": app_version,
        "exportedAt": exported_at,
        "boardId": c.board["id"],
        "name": c.board["name"],
        "embeddingModel": null,
        "embeddingDim": null,
        "counts": { "placements": c.placements.len(), "assets": c.assets.len(), "categories": c.categories.len() },
    });
    let mut z = ZipWriter::new(out);
    let json_file = |z: &mut ZipWriter<W>, name: &str, v: &Value| -> Result<(), String> {
        z.start_file(name, deflate).map_err(e)?;
        z.write_all(serde_json::to_string(v).map_err(|x| x.to_string())?.as_bytes()).map_err(io)
    };
    json_file(&mut z, "manifest.json", &manifest)?; // first entry
    json_file(&mut z, "board.json", &json!({ "board": c.board, "placements": c.placements }))?;
    json_file(&mut z, "assets.json", &Value::Array(c.assets.clone()))?;
    json_file(&mut z, "categories.json", &Value::Array(c.categories.clone()))?;
    let mut done = HashSet::new();
    for a in &c.assets {
        let (hash, ext) = (s(a, "hash"), s(a, "ext"));
        if !done.insert(hash.to_string()) {
            continue;
        }
        z.start_file(format!("images/{hash}.{ext}"), stored).map_err(e)?;
        z.write_all(&image(hash, ext)?).map_err(io)?;
    }
    z.finish().map_err(e)?;
    Ok(())
}

fn text<R: Read + Seek>(z: &mut ZipArchive<R>, name: &str) -> Result<Value, String> {
    let mut f = z.by_name(name).map_err(|_| format!("This .bo file is damaged (missing {name})."))?;
    let mut buf = String::new();
    f.read_to_string(&mut buf).map_err(|_| format!("This .bo file is damaged ({name} is unreadable)."))?;
    serde_json::from_str(&buf).map_err(|_| format!("This .bo file is damaged ({name} is unreadable)."))
}

/// Reads and validates a `.bo`. Errors are messages fit to show to the user. Image bytes are not loaded (see `read_image`).
pub fn read<R: Read + Seek>(r: R) -> Result<Content, String> {
    let mut z = ZipArchive::new(r).map_err(|_| "This is not a valid .bo file.".to_string())?;
    let manifest = text(&mut z, "manifest.json")?;
    if manifest["format"] != FORMAT {
        return Err("This is not a Board file.".into());
    }
    match manifest["formatVersion"].as_u64() {
        Some(v) if v <= MAX_VERSION => {}
        _ => return Err("This file was made by a newer version of Board. Update Board to open it.".into()),
    }
    let b = text(&mut z, "board.json")?;
    let (assets, categories) = (text(&mut z, "assets.json")?, text(&mut z, "categories.json")?);
    let (Some(placements), Some(assets), Some(categories)) = (b["placements"].as_array(), assets.as_array(), categories.as_array()) else {
        return Err("This .bo file is damaged.".into());
    };
    if s(&b["board"], "id").is_empty() {
        return Err("This .bo file is damaged.".into());
    }
    for a in assets {
        if z.by_name(&format!("images/{}.{}", s(a, "hash"), s(a, "ext"))).is_err() {
            return Err("This .bo file is damaged (an image file is missing).".into());
        }
    }
    Ok(Content { board: b["board"].clone(), placements: placements.clone(), assets: assets.clone(), categories: categories.clone() })
}

/// One image's bytes out of the archive.
pub fn read_image<R: Read + Seek>(r: R, hash: &str, ext: &str) -> Result<Vec<u8>, String> {
    let mut z = ZipArchive::new(r).map_err(|_| "This is not a valid .bo file.".to_string())?;
    let mut f = z.by_name(&format!("images/{hash}.{ext}")).map_err(|_| "This .bo file is damaged (an image file is missing).".to_string())?;
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).map_err(|x| x.to_string())?;
    Ok(buf)
}

pub struct Plan {
    pub board: Value,
    pub placements: Vec<Value>,
    /// Images not yet in the library; they get new ids. (asset document, extension in the zip)
    pub add_assets: Vec<(Value, String)>,
    pub add_categories: Vec<Value>,
    /// Images already in the library (same hash): the file's categories are added to them, nothing else changes.
    pub merge_categories: Vec<(String, Vec<String>)>,
}

/// What importing changes (spec "Reading"): reuse library images with the same hash, match categories by name
/// (case-insensitive), always a new board with fresh ids. Pure: nothing is written.
pub fn plan(c: &Content, hashes: &HashMap<String, String>, categories: &[Value], now_ms: u64, mut id: impl FnMut() -> String) -> Plan {
    let mut by_name: HashMap<String, String> = categories.iter().map(|x| (s(x, "name").to_lowercase(), s(x, "id").to_string())).collect();
    let mut cat_map: HashMap<String, String> = HashMap::new();
    let mut add_categories = vec![];
    for cat in &c.categories {
        let key = s(cat, "name").to_lowercase();
        let new = by_name.entry(key).or_insert_with(|| {
            let n = id();
            add_categories.push(json!({ "id": n, "name": cat["name"], "color": cat["color"] }));
            n
        });
        cat_map.insert(s(cat, "id").to_string(), new.clone());
    }
    let map_cats = |a: &Value| -> Vec<String> {
        let mut out: Vec<String> = vec![];
        for c in a["categoryIds"].as_array().into_iter().flatten().filter_map(|c| c.as_str()) {
            if let Some(m) = cat_map.get(c) {
                if !out.contains(m) {
                    out.push(m.clone());
                }
            }
        }
        out
    };

    let (mut asset_map, mut by_hash) = (HashMap::<String, String>::new(), HashMap::<String, String>::new());
    let (mut add_assets, mut merge_categories) = (vec![], vec![]);
    for a in &c.assets {
        let hash = s(a, "hash");
        if let Some(existing) = hashes.get(hash).or_else(|| by_hash.get(hash)) {
            asset_map.insert(s(a, "id").to_string(), existing.clone());
            if hashes.contains_key(hash) {
                merge_categories.push((existing.clone(), map_cats(a)));
            }
            continue;
        }
        let n = id();
        asset_map.insert(s(a, "id").to_string(), n.clone());
        by_hash.insert(hash.to_string(), n.clone());
        let mut doc: Map<String, Value> = a.as_object().cloned().unwrap_or_default();
        let ext = doc.remove("ext").and_then(|e| e.as_str().map(String::from)).unwrap_or_default();
        doc.insert("id".into(), json!(n));
        doc.insert("categoryIds".into(), json!(map_cats(a)));
        add_assets.push((Value::Object(doc), ext));
    }

    let mut board = c.board.clone();
    let board_id = id();
    board["id"] = json!(board_id);
    board["createdAt"] = json!(now_ms);
    let mut placements = vec![];
    for p in &c.placements {
        let mut p = p.clone();
        if !matches!(s(&p, "kind"), "note" | "shape" | "ink" | "text") {
            match asset_map.get(s(&p, "assetId")) {
                Some(a) => p["assetId"] = json!(a),
                None => continue, // its image is gone
            }
        }
        p["id"] = json!(id());
        p["boardId"] = json!(board_id);
        placements.push(p);
    }
    Plan { board, placements, add_assets, add_categories, merge_categories }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn asset(id: &str, hash: &str, cats: &[&str]) -> Value {
        json!({"id": id, "hash": hash, "ext": "png", "width": 10, "height": 10, "palette": [], "colors": ["red"], "categoryIds": cats, "createdAt": 1})
    }
    fn content() -> Content {
        Content {
            board: json!({"id": "b1", "name": "Lounge", "createdAt": 1, "view": {"x": 0, "y": 0, "zoom": 1}}),
            placements: vec![
                json!({"id": "p1", "boardId": "b1", "assetId": "a1", "x": 0, "y": 0, "w": 10, "h": 10, "z": 1}),
                json!({"id": "p2", "boardId": "b1", "assetId": "a2", "x": 20, "y": 0, "w": 10, "h": 10, "z": 2}),
                json!({"id": "p3", "boardId": "b1", "kind": "note", "assetId": "", "text": "hi", "x": 0, "y": 20, "w": 20, "h": 20, "z": 3}),
            ],
            assets: vec![asset("a1", "h1", &["c1"]), asset("a2", "h2", &[])],
            categories: vec![json!({"id": "c1", "name": "Warm", "color": "#f00"})],
        }
    }
    fn bytes_for(c: &Content) -> Vec<u8> {
        let mut out = Cursor::new(Vec::new());
        write(&mut out, c, "0.4.0", "2026-11-15T00:00:00.000Z", |h, _| Ok(h.as_bytes().to_vec())).unwrap();
        out.into_inner()
    }
    fn ids() -> impl FnMut() -> String {
        let mut n = 0;
        move || {
            n += 1;
            format!("new{n}")
        }
    }

    #[test]
    fn round_trip_keeps_board_tags_and_image_bytes() {
        let b = bytes_for(&content());
        let back = read(Cursor::new(&b)).unwrap();
        assert_eq!(back.board, content().board);
        assert_eq!(back.placements.len(), 3);
        assert_eq!(back.categories[0]["name"], "Warm");
        assert_eq!(read_image(Cursor::new(&b), "h1", "png").unwrap(), b"h1");
    }

    #[test]
    fn version_is_1_unless_ink_or_text() {
        let version = |c: &Content| read(Cursor::new(bytes_for(c))).map(|_| ()).and_then(|_| {
            let mut z = ZipArchive::new(Cursor::new(bytes_for(c))).unwrap();
            Ok(text(&mut z, "manifest.json")?["formatVersion"].as_u64().unwrap())
        });
        assert_eq!(version(&content()).unwrap(), 1);
        let mut c = content();
        c.placements.push(json!({"id": "p4", "boardId": "b1", "kind": "ink", "assetId": "", "x": 0, "y": 0, "w": 1, "h": 1, "z": 4}));
        assert_eq!(version(&c).unwrap(), 2);
        let mut c = content();
        c.placements.push(json!({"id": "p5", "boardId": "b1", "kind": "text", "assetId": "", "text": "x", "x": 0, "y": 0, "w": 1, "h": 1, "z": 4}));
        assert_eq!(version(&c).unwrap(), 2);
    }

    fn zip_of(files: &[(&str, &str)]) -> Vec<u8> {
        let mut z = ZipWriter::new(Cursor::new(Vec::new()));
        for (n, t) in files {
            z.start_file(*n, SimpleFileOptions::default()).unwrap();
            z.write_all(t.as_bytes()).unwrap();
        }
        z.finish().unwrap().into_inner()
    }

    #[test]
    fn refuses_newer_foreign_and_garbage() {
        let m = |v: &str| zip_of(&[("manifest.json", v)]);
        assert!(read(Cursor::new(m(r#"{"format":"remstudio-board","formatVersion":99}"#))).unwrap_err().contains("newer"));
        assert_eq!(read(Cursor::new(m(r#"{"format":"other","formatVersion":1}"#))).unwrap_err(), "This is not a Board file.");
        assert_eq!(read(Cursor::new(b"nope".to_vec())).unwrap_err(), "This is not a valid .bo file.");
        assert!(read(Cursor::new(m(r#"{"format":"remstudio-board","formatVersion":1}"#))).unwrap_err().contains("missing board.json"));
    }

    #[test]
    fn missing_image_is_reported() {
        let mut c = content();
        c.assets.push(asset("a3", "h3", &[]));
        let ok = bytes_for(&c);
        let mut z = ZipArchive::new(Cursor::new(&ok)).unwrap();
        // Rebuild without images/h3.png.
        let mut out = ZipWriter::new(Cursor::new(Vec::new()));
        for i in 0..z.len() {
            let mut f = z.by_index(i).unwrap();
            if f.name() == "images/h3.png" { continue }
            let mut buf = vec![];
            f.read_to_end(&mut buf).unwrap();
            out.start_file(f.name().to_string(), SimpleFileOptions::default()).unwrap();
            out.write_all(&buf).unwrap();
        }
        let err = read(Cursor::new(out.finish().unwrap().into_inner())).unwrap_err();
        assert!(err.contains("image file is missing"), "{err}");
    }

    #[test]
    fn plan_adds_new_images_with_new_ids_and_makes_a_new_board() {
        let p = plan(&content(), &HashMap::new(), &[], 99, ids());
        assert_eq!(p.add_assets.len(), 2);
        assert_eq!(p.add_categories.len(), 1);
        assert_eq!(p.board["createdAt"], 99);
        assert_ne!(p.board["id"], "b1");
        assert_eq!(p.placements.len(), 3);
        assert!(p.placements.iter().all(|x| x["boardId"] == p.board["id"] && x["id"] != "p1"));
        // The placement points at the new asset id, and the asset carries the mapped category.
        let first = &p.add_assets[0].0;
        assert_eq!(p.placements[0]["assetId"], first["id"]);
        assert_eq!(first["categoryIds"][0], p.add_categories[0]["id"]);
        assert!(first.get("ext").is_none() && first["hash"] == "h1" && p.add_assets[0].1 == "png");
    }

    #[test]
    fn plan_reuses_library_images_and_categories_by_hash_and_name() {
        let hashes = HashMap::from([("h1".to_string(), "lib1".to_string())]);
        let cats = [json!({"id": "lc", "name": "WARM", "color": "#a00"})];
        let p = plan(&content(), &hashes, &cats, 1, ids());
        assert_eq!(p.add_assets.len(), 1); // only h2 is new
        assert!(p.add_categories.is_empty());
        assert_eq!(p.merge_categories, vec![("lib1".to_string(), vec!["lc".to_string()])]);
        assert_eq!(p.placements[0]["assetId"], "lib1");
    }

    #[test]
    fn plan_collapses_duplicate_hashes_inside_the_file_and_drops_orphans() {
        let mut c = content();
        c.assets.push(asset("a1b", "h1", &[]));
        c.placements.push(json!({"id": "p4", "boardId": "b1", "assetId": "a1b", "x": 0, "y": 0, "w": 1, "h": 1, "z": 4}));
        c.placements.push(json!({"id": "p5", "boardId": "b1", "assetId": "ghost", "x": 0, "y": 0, "w": 1, "h": 1, "z": 5}));
        let p = plan(&c, &HashMap::new(), &[], 1, ids());
        assert_eq!(p.add_assets.len(), 2);
        assert_eq!(p.placements.len(), 4); // ghost dropped
        assert_eq!(p.placements[3]["assetId"], p.placements[0]["assetId"]);
    }

    #[test]
    fn plan_keeps_ink_and_text_without_assets() {
        let mut c = content();
        c.placements.push(json!({"id": "p4", "boardId": "b1", "kind": "ink", "assetId": "", "x": 0, "y": 0, "w": 1, "h": 1, "z": 4, "ink": {"points": [0, 0, 1]}}));
        c.placements.push(json!({"id": "p5", "boardId": "b1", "kind": "text", "assetId": "", "text": "x", "x": 0, "y": 0, "w": 1, "h": 1, "z": 5}));
        let p = plan(&c, &HashMap::new(), &[], 1, ids());
        assert_eq!(p.placements.iter().filter(|x| matches!(x["kind"].as_str(), Some("ink" | "text"))).count(), 2);
        assert_eq!(p.placements[3]["ink"]["points"][2], 1);
    }

    #[test]
    fn reads_a_file_written_by_the_ts_side() {
        let bytes = std::fs::read(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ts-written.bo")).unwrap();
        let c = read(Cursor::new(&bytes)).unwrap();
        assert_eq!(c.board["name"], "Fixture");
        assert_eq!(c.placements.len(), 3);
        assert_eq!(c.placements[2]["ink"]["points"][3], 10);
        let img = read_image(Cursor::new(&bytes), "hash-red", "png").unwrap();
        let a = crate::import::analyze(&img).unwrap();
        assert_eq!((a.width, a.height, a.colors), (1, 1, vec!["red"]));
        let p = plan(&c, &HashMap::new(), &[], 1, ids());
        assert_eq!((p.add_assets.len(), p.placements.len()), (1, 3));
    }

    #[test]
    fn ids_look_like_uuids_and_differ() {
        let (a, b) = (new_id(), new_id());
        assert_ne!(a, b);
        assert_eq!(a.len(), 36);
        assert_eq!(a.matches('-').count(), 4);
    }
}
