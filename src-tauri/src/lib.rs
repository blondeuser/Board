// REMind desktop shell. The UI is the web build in ../dist; storage lives here (docs/RUST_BACKEND.md step 1).
// Plugins: http (LIT Awards + link previews without CORS), dialog + fs (native Save), opener (system browser).
mod db;
mod files;

use db::Db;
use files::Files;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{ipc::Request, Manager, State};

struct Store {
    db: Mutex<Db>,
    files: Files,
}

type Res<T> = Result<T, String>;

impl Store {
    fn db(&self) -> Res<std::sync::MutexGuard<'_, Db>> {
        self.db.lock().map_err(|_| "database lock poisoned".to_string())
    }
}

// Commands are thin wrappers: no logic here, it lives in db.rs / files.rs.

#[tauri::command]
fn load_all(s: State<Store>) -> Res<Value> { s.db()?.load_all() }
#[tauri::command]
fn save_boards(s: State<Store>, items: Vec<Value>) -> Res<()> { s.db()?.save_boards(&items) }
#[tauri::command]
fn save_assets(s: State<Store>, items: Vec<Value>) -> Res<()> { s.db()?.save_assets(&items) }
#[tauri::command]
fn save_placements(s: State<Store>, items: Vec<Value>) -> Res<()> { s.db()?.save_placements(&items) }
#[tauri::command]
fn save_connections(s: State<Store>, items: Vec<Value>) -> Res<()> { s.db()?.save_connections(&items) }
#[tauri::command]
fn save_categories(s: State<Store>, items: Vec<Value>) -> Res<()> { s.db()?.save_categories(&items) }
#[tauri::command]
fn delete_board(s: State<Store>, id: String) -> Res<()> { s.db()?.delete_board(&id) }
#[tauri::command]
fn delete_placements(s: State<Store>, ids: Vec<String>) -> Res<()> { s.db()?.delete_placements(&ids) }
#[tauri::command]
fn delete_connections(s: State<Store>, ids: Vec<String>) -> Res<()> { s.db()?.delete_connections(&ids) }
#[tauri::command]
fn delete_category(s: State<Store>, id: String) -> Res<()> { s.db()?.delete_category(&id) }
#[tauri::command]
fn meta_get(s: State<Store>, key: String) -> Res<Option<String>> { s.db()?.meta_get(&key) }
#[tauri::command]
fn meta_set(s: State<Store>, key: String, value: String) -> Res<()> { s.db()?.meta_set(&key, &value) }

/// Deletes the rows first, then the files: a crash in between leaves orphan files, never rows without files.
#[tauri::command]
fn delete_assets(s: State<Store>, ids: Vec<String>) -> Res<()> {
    s.db()?.delete_assets(&ids)?;
    ids.iter().for_each(|id| s.files.remove_asset(id));
    Ok(())
}

#[tauri::command]
fn clear_all(s: State<Store>) -> Res<()> {
    let ids: Vec<String> = s.db()?.load_all()?["assets"].as_array().into_iter().flatten().filter_map(|a| a["id"].as_str().map(String::from)).collect();
    s.db()?.clear_all()?;
    ids.iter().for_each(|id| s.files.remove_asset(id));
    Ok(())
}

/// Raw binary body (no JSON/base64): u32 BE len | {"asset":{..},"ext":"jpg"} | u32 BE len | thumb | original.
#[tauri::command]
fn add_asset(s: State<Store>, req: Request) -> Res<()> {
    let tauri::ipc::InvokeBody::Raw(body) = req.body() else { return Err("expected a raw body".into()) };
    let (json, thumb, original) = files::split_frame(body)?;
    let head: Value = serde_json::from_slice(json).map_err(|x| x.to_string())?;
    let (asset, ext) = (head["asset"].clone(), head["ext"].as_str().unwrap_or("bin"));
    let id = asset["id"].as_str().ok_or("asset has no id")?.to_string();
    // Files first: a row never points at a missing file.
    Files::write(&s.files.original(&id, ext), original)?;
    if !thumb.is_empty() {
        Files::write(&s.files.thumb(&id), thumb)?;
    }
    s.db()?.save_assets(&[asset])
}

/// Replaces a thumbnail (older images get one lazily).
#[tauri::command]
fn save_thumb(s: State<Store>, req: Request) -> Res<()> {
    let tauri::ipc::InvokeBody::Raw(body) = req.body() else { return Err("expected a raw body".into()) };
    let id = req.headers().get("x-asset-id").and_then(|v| v.to_str().ok()).ok_or("missing x-asset-id")?;
    Files::write(&s.files.thumb(id), body)
}

/// Paths for the UI (shown via convertFileSrc, bytes never travel over IPC): [original, thumb], null when missing.
#[tauri::command]
fn asset_paths(s: State<Store>, id: String) -> Vec<Option<String>> {
    let p = |p: Option<std::path::PathBuf>| p.map(|p| p.to_string_lossy().into_owned());
    vec![p(s.files.find_original(&id)), p(Some(s.files.thumb(&id)).filter(|t| t.exists()))]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            std::fs::create_dir_all(&root)?;
            let db = Db::open(&root.join("board.sqlite"))?;
            app.manage(Store { db: Mutex::new(db), files: Files(root.join("library")) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_all, save_boards, save_assets, save_placements, save_connections, save_categories, delete_board,
            delete_assets, delete_placements, delete_connections, delete_category, clear_all, add_asset, save_thumb,
            asset_paths, meta_get, meta_set
        ])
        .run(tauri::generate_context!())
        .expect("error while running REMind");
}
