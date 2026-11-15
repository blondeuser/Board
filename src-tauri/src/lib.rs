// REMind desktop shell. The UI is the web build in ../dist; storage lives here (docs/RUST_BACKEND.md step 1).
// Plugins: http (LIT Awards + link previews without CORS), dialog + fs (native Save), opener (system browser).
mod analyze;
mod bo;
mod color;
mod db;
mod files;
mod import;
mod settings;
mod storage;

use analyze::{Analyzer, Model, Scored, EMBEDDING_MODEL};
use db::Db;
use files::Files;
use serde_json::Value;
use std::{collections::HashMap, path::PathBuf, sync::{atomic::{AtomicBool, Ordering}, Mutex}};
use tauri::{ipc::Request, Emitter, Manager, State, WebviewUrl};

struct Store {
    db: Mutex<Db>,
    files: Files,
    model_dir: PathBuf,
    /// Loaded on first use (a second or so); None until then.
    analyzer: Mutex<Option<Analyzer>>,
    /// In-memory search index of current-model embeddings; None = rebuild from the database on next use.
    index: Mutex<Option<HashMap<String, Vec<f32>>>>,
    /// A .bo path from the command line (double-click in Explorer); handed to the UI once.
    launch_file: Mutex<Option<String>>,
    /// Where the library and cache live (docs/STORAGE.md), the settings file's folder, and the move state.
    paths: storage::Resolved,
    config_dir: PathBuf,
    default_cache: PathBuf,
    settings: Mutex<settings::Settings>,
    /// True while the library is being copied: every database call fails so nothing is written after the snapshot.
    moving: AtomicBool,
    cancel_move: AtomicBool,
}

type Res<T> = Result<T, String>;

impl Store {
    fn db(&self) -> Res<std::sync::MutexGuard<'_, Db>> {
        if self.moving.load(Ordering::Relaxed) { return Err("The library is being moved.".into()) }
        self.db.lock().map_err(|_| "database lock poisoned".to_string())
    }
    fn invalidate_index(&self) {
        if let Ok(mut i) = self.index.lock() { *i = None }
    }
    fn analyzer(&self) -> Res<std::sync::MutexGuard<'_, Option<Analyzer>>> {
        let mut a = self.analyzer.lock().map_err(|_| "analyzer lock poisoned".to_string())?;
        if a.is_none() {
            *a = Some(Analyzer::new(Model::load(&self.model_dir)?));
        }
        Ok(a)
    }
}

// Commands are thin wrappers: no logic here, it lives in db.rs / files.rs.

#[tauri::command]
fn load_all(s: State<Store>) -> Res<Value> { s.db()?.load_all() }
#[tauri::command]
fn save_boards(s: State<Store>, items: Vec<Value>) -> Res<()> { s.db()?.save_boards(&items) }
#[tauri::command]
fn save_assets(s: State<Store>, items: Vec<Value>) -> Res<()> {
    if s.db()?.save_assets(&items)? { s.invalidate_index() }
    Ok(())
}
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
    s.invalidate_index();
    ids.iter().for_each(|id| s.files.remove_asset(id));
    Ok(())
}

#[tauri::command]
fn clear_all(s: State<Store>) -> Res<()> {
    let ids: Vec<String> = s.db()?.load_all()?["assets"].as_array().into_iter().flatten().filter_map(|a| a["id"].as_str().map(String::from)).collect();
    s.db()?.clear_all()?;
    s.invalidate_index();
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
    let thumb_ext = head["thumbExt"].as_str().unwrap_or("webp");
    let id = asset["id"].as_str().ok_or("asset has no id")?.to_string();
    // Files first: a row never points at a missing file.
    Files::write(&s.files.original(&id, ext), original)?;
    if !thumb.is_empty() {
        Files::write(&s.files.thumb(&id, thumb_ext), thumb)?;
    }
    if s.db()?.save_assets(&[asset])? { s.invalidate_index() }
    Ok(())
}

/// Replaces a thumbnail (older images get one lazily).
#[tauri::command]
fn save_thumb(s: State<Store>, req: Request) -> Res<()> {
    let tauri::ipc::InvokeBody::Raw(body) = req.body() else { return Err("expected a raw body".into()) };
    let h = |k: &str| req.headers().get(k).and_then(|v| v.to_str().ok());
    let (id, ext) = (h("x-asset-id").ok_or("missing x-asset-id")?, h("x-thumb-ext").unwrap_or("webp"));
    let old = s.files.find_thumb(id);
    Files::write(&s.files.thumb(id, ext), body)?;
    if let Some(old) = old.filter(|o| *o != s.files.thumb(id, ext)) {
        std::fs::remove_file(old).ok();
    }
    Ok(())
}

/// Import one image: raw body = frame { json {"id","createdAt","source"?} | empty | original bytes }. Hashes, dedupes
/// (an existing image with the same content is returned instead), decodes, makes the thumbnail and palette, stores
/// files + row. Returns { asset, duplicate }; the image bytes never come back.
#[tauri::command]
async fn import_image(s: State<'_, Store>, req: Request<'_>) -> Res<Value> {
    let tauri::ipc::InvokeBody::Raw(body) = req.body() else { return Err("expected a raw body".into()) };
    let (json, _, original) = files::split_frame(body)?;
    let head: Value = serde_json::from_slice(json).map_err(|x| x.to_string())?;
    let bytes = original.to_vec();
    // Decoding is CPU work: keep it off the async workers and outside the database lock.
    let a = tauri::async_runtime::spawn_blocking(move || import::analyze(&bytes)).await.map_err(|x| x.to_string())??;
    let mut db = s.db()?;
    if let Some(asset) = db.find_by_hash(&a.hash)? {
        return Ok(serde_json::json!({"asset": asset, "duplicate": true}));
    }
    let id = head["id"].as_str().ok_or("missing id")?.to_string();
    let mut asset = serde_json::json!({
        "id": id, "width": a.width, "height": a.height, "palette": a.palette, "colors": a.colors,
        "categoryIds": [], "hash": a.hash, "createdAt": head["createdAt"],
    });
    if !head["source"].is_null() {
        asset["source"] = head["source"].clone();
    }
    // Files first: a row never points at a missing file.
    Files::write(&s.files.original(&id, a.ext), original)?;
    Files::write(&s.files.thumb(&id, &a.thumb.0), &a.thumb.1)?;
    db.save_assets(&[asset.clone()])?;
    Ok(serde_json::json!({"asset": asset, "duplicate": false}))
}

/// Paths for the UI (shown via convertFileSrc, bytes never travel over IPC): [original, thumb], null when missing.
#[tauri::command]
fn asset_paths(s: State<Store>, id: String) -> Vec<Option<String>> {
    let p = |p: Option<std::path::PathBuf>| p.map(|p| p.to_string_lossy().into_owned());
    vec![p(s.files.find_original(&id)), p(s.files.find_thumb(&id))]
}

/// Saves a board as a .bo at `path` (written to a temp file first, then renamed). Returns { images }.
#[tauri::command]
async fn export_bo(app: tauri::AppHandle, s: State<'_, Store>, board_id: String, path: String, exported_at: String) -> Res<Value> {
    let all = s.db()?.load_all()?;
    let list = |k: &str| all[k].as_array().cloned().unwrap_or_default();
    let board = list("boards").into_iter().find(|b| b["id"] == board_id.as_str()).ok_or("board not found")?;
    let placements: Vec<Value> = list("placements").into_iter().filter(|p| p["boardId"] == board_id.as_str()).collect();
    let (all_assets, all_cats) = (list("assets"), list("categories"));
    let mut assets = vec![];
    let mut seen = std::collections::HashSet::new();
    for id in placements.iter().filter_map(|p| p["assetId"].as_str()).filter(|i| !i.is_empty()) {
        if !seen.insert(id.to_string()) { continue }
        let mut a = all_assets.iter().find(|a| a["id"] == id).cloned().ok_or("missing image")?;
        let orig = s.files.find_original(id).ok_or("missing image")?;
        let ext = orig.extension().and_then(|e| e.to_str()).unwrap_or("img").to_string();
        if a["hash"].as_str().is_none_or(str::is_empty) {
            a["hash"] = import::sha256_hex(&std::fs::read(&orig).map_err(|e| e.to_string())?).into();
        }
        if let Some(o) = a.as_object_mut() { o.remove("embedding"); o.remove("embeddingModel"); }
        a["ext"] = ext.into();
        assets.push(a);
    }
    let used: std::collections::HashSet<&str> = assets.iter().flat_map(|a| a["categoryIds"].as_array().into_iter().flatten().filter_map(|c| c.as_str())).collect();
    let categories = all_cats.iter().filter(|c| c["id"].as_str().is_some_and(|i| used.contains(i))).cloned().collect();
    let content = bo::Content { board, placements, assets, categories };
    let count = content.assets.len();
    let by_hash: HashMap<String, String> = content.assets.iter().filter_map(|a| Some((a["hash"].as_str()?.to_string(), a["id"].as_str()?.to_string()))).collect();
    let total = by_hash.len();
    let mut written = 0;
    let tmp = PathBuf::from(format!("{path}.tmp"));
    let out = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    let result = bo::write(std::io::BufWriter::new(out), &content, env!("CARGO_PKG_VERSION"), &exported_at, |hash, ext| {
        let id = by_hash.get(hash).ok_or("missing image")?;
        let _ = ext;
        written += 1;
        let _ = app.emit("bo-progress", serde_json::json!({ "done": written, "total": total }));
        std::fs::read(s.files.find_original(id).ok_or("missing image")?).map_err(|e| e.to_string())
    });
    if let Err(e) = result {
        std::fs::remove_file(&tmp).ok();
        return Err(e);
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "images": count }))
}

/// Opens a .bo as a new board: images already in the library (same hash) are reused, new ones get files + thumbnails,
/// categories match by name. Everything is decoded before anything is written. Returns { boardId, name, newImages }.
#[tauri::command]
async fn import_bo(app: tauri::AppHandle, s: State<'_, Store>, path: String) -> Res<Value> {
    let content = bo::read(std::io::BufReader::new(std::fs::File::open(&path).map_err(|_| "Could not open that file.".to_string())?))?;
    let all = s.db()?.load_all()?;
    let lib_assets = all["assets"].as_array().cloned().unwrap_or_default();
    let lib_cats = all["categories"].as_array().cloned().unwrap_or_default();
    // Hash of every library image; older ones without a hash get it filled in from their file.
    let mut hashes = HashMap::new();
    let mut backfill = vec![];
    for a in &lib_assets {
        let Some(id) = a["id"].as_str() else { continue };
        match a["hash"].as_str().filter(|h| !h.is_empty()) {
            Some(h) => { hashes.insert(h.to_string(), id.to_string()); }
            None => {
                let Some(p) = s.files.find_original(id) else { continue };
                let h = import::sha256_hex(&std::fs::read(p).map_err(|e| e.to_string())?);
                hashes.insert(h.clone(), id.to_string());
                let mut b = a.clone();
                b["hash"] = h.into();
                backfill.push(b);
            }
        }
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
    let plan = bo::plan(&content, &hashes, &lib_cats, now, bo::new_id);
    // Decode everything first so a bad image fails the import before anything is written.
    let mut ready = vec![];
    let total = plan.add_assets.len();
    for (asset, ext) in &plan.add_assets {
        let hash = asset["hash"].as_str().unwrap_or("");
        let bytes = bo::read_image(std::io::BufReader::new(std::fs::File::open(&path).map_err(|e| e.to_string())?), hash, ext)?;
        let a = import::analyze(&bytes).map_err(|_| "Could not read an image in this file.".to_string())?;
        ready.push((asset.clone(), bytes, a));
        let _ = app.emit("bo-progress", serde_json::json!({ "done": ready.len(), "total": total }));
    }
    for (asset, bytes, a) in &ready {
        let id = asset["id"].as_str().unwrap_or("");
        Files::write(&s.files.original(id, a.ext), bytes)?;
        Files::write(&s.files.thumb(id, &a.thumb.0), &a.thumb.1)?;
    }
    let mut db = s.db()?;
    if !plan.add_categories.is_empty() { db.save_categories(&plan.add_categories)? }
    let mut changed: Vec<Value> = ready.iter().map(|(a, _, _)| a.clone()).collect();
    let mut cur: HashMap<String, Value> = lib_assets.into_iter().filter_map(|a| Some((a["id"].as_str()?.to_string(), a))).collect();
    for b in backfill { cur.insert(b["id"].as_str().unwrap_or("").to_string(), b.clone()); changed.push(b) }
    for (id, cats) in &plan.merge_categories {
        let Some(a) = cur.get(id).cloned() else { continue };
        let mut ids: Vec<Value> = a["categoryIds"].as_array().cloned().unwrap_or_default();
        for c in cats { if !ids.iter().any(|x| x == c.as_str()) { ids.push(c.clone().into()) } }
        let mut a = a;
        a["categoryIds"] = ids.into();
        changed.retain(|x| x["id"] != a["id"]);
        changed.push(a);
    }
    if !changed.is_empty() { db.save_assets(&changed)?; }
    db.save_boards(&[plan.board.clone()])?;
    db.save_placements(&plan.placements)?;
    drop(db);
    s.invalidate_index();
    Ok(serde_json::json!({ "boardId": plan.board["id"], "name": plan.board["name"], "newImages": ready.len() }))
}

/// The .bo this process was started with, once (then None).
#[tauri::command]
fn take_launch_file(s: State<Store>) -> Option<String> { s.launch_file.lock().ok()?.take() }

/// Width of the Pinterest panel in logical pixels.
static PANEL_W: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(480);

/// Lays the main webview and the Pinterest panel (a child webview with no capabilities, so its scripts can't call REMind) side by side.
fn layout(app: &tauri::AppHandle) {
    let (Some(win), Some(main)) = (app.get_window("main"), app.get_webview("main")) else { return };
    let Ok(size) = win.inner_size() else { return };
    let panel = app.get_webview("pinterest");
    let pw = if panel.is_some() { (PANEL_W.load(std::sync::atomic::Ordering::Relaxed) as f64 * win.scale_factor().unwrap_or(1.0)) as u32 } else { 0 }.min(size.width / 2);
    let _ = main.set_position(tauri::PhysicalPosition::new(0, 0));
    let _ = main.set_size(tauri::PhysicalSize::new(size.width - pw, size.height));
    if let Some(p) = panel {
        let _ = p.set_position(tauri::PhysicalPosition::new((size.width - pw) as i32, 0));
        let _ = p.set_size(tauri::PhysicalSize::new(pw, size.height));
    }
}

/// Shows or hides Pinterest as a panel inside the main window. Returns true when it is now shown.
#[tauri::command]
async fn toggle_pinterest(app: tauri::AppHandle) -> Res<bool> { // async: building a webview from a sync command runs on the main thread and deadlocks on Windows
    if let Some(p) = app.get_webview("pinterest") {
        p.close().map_err(|e| e.to_string())?;
        layout(&app);
        let _ = app.emit("pinterest-open", false);
        return Ok(false);
    }
    let win = app.get_window("main").ok_or("no main window")?;
    let url: tauri::Url = "https://www.pinterest.com".parse().map_err(|e| format!("{e}"))?;
    win.add_child(tauri::webview::WebviewBuilder::new("pinterest", WebviewUrl::External(url)), tauri::LogicalPosition::new(0.0, 0.0), tauri::LogicalSize::new(PANEL_W.load(std::sync::atomic::Ordering::Relaxed) as f64, 600.0)).map_err(|e| e.to_string())?;
    layout(&app);
    let _ = app.emit("pinterest-open", true);
    Ok(true)
}

/// Sets the Pinterest panel width (logical px, clamped) while the user drags the handle.
#[tauri::command]
fn set_pinterest_width(app: tauri::AppHandle, w: u32) {
    PANEL_W.store(w.clamp(240, 1600), std::sync::atomic::Ordering::Relaxed);
    layout(&app);
}

/// Sizes and paths for Settings → Storage, plus the missing-library state for the start-up dialog.
#[tauri::command]
async fn storage_info(app: tauri::AppHandle) -> Res<Value> {
    tauri::async_runtime::spawn_blocking(move || -> Res<Value> {
        let s = app.state::<Store>();
        let images = s.db().ok().and_then(|d| d.row_counts().ok()).map_or(0, |c| c[1]);
        let settings = s.settings.lock().map_err(|_| "settings lock poisoned")?.clone();
        let mut v = serde_json::to_value(storage::info(&s.paths, &settings)).map_err(|e| e.to_string())?;
        v["images"] = images.into();
        Ok(v)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Copies the library to `path`, verifies it, switches to it and restarts. Progress: `storage-progress`.
#[tauri::command]
async fn move_library(app: tauri::AppHandle, path: String) -> Res<()> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || -> Res<()> {
        let s = handle.state::<Store>();
        s.cancel_move.store(false, Ordering::Relaxed);
        s.moving.store(true, Ordering::Relaxed);
        let result = (|| {
            let db = s.db.lock().map_err(|_| "database lock poisoned".to_string())?;
            let mut settings = s.settings.lock().map_err(|_| "settings lock poisoned".to_string())?;
            storage::move_library(&db, &s.paths, &s.config_dir, &mut settings, &PathBuf::from(path), &|p| { let _ = handle.emit("storage-progress", p); }, &s.cancel_move)
        })();
        s.moving.store(false, Ordering::Relaxed);
        result
    })
    .await
    .map_err(|e| e.to_string())??;
    app.restart()
}

#[tauri::command]
fn cancel_move(s: State<Store>) { s.cancel_move.store(true, Ordering::Relaxed) }

/// Deletes the library left behind by the last move.
#[tauri::command]
async fn delete_old_library(app: tauri::AppHandle) -> Res<()> {
    tauri::async_runtime::spawn_blocking(move || -> Res<()> {
        let s = app.state::<Store>();
        let mut settings = s.settings.lock().map_err(|_| "settings lock poisoned".to_string())?;
        storage::delete_old_library(&s.paths, &s.config_dir, &mut settings)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// New cache folder (None = default); thumbnails are copied over, then the app restarts.
#[tauri::command]
async fn set_cache_dir(app: tauri::AppHandle, path: Option<String>) -> Res<()> {
    tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || -> Res<()> {
            let s = app.state::<Store>();
            let mut settings = s.settings.lock().map_err(|_| "settings lock poisoned".to_string())?;
            storage::set_cache_dir(path.map(PathBuf::from).as_deref(), &s.paths, &s.default_cache, &s.config_dir, &mut settings)
        }
    })
    .await
    .map_err(|e| e.to_string())??;
    app.restart()
}

/// Deletes all thumbnails and makes them again from the originals. Progress: `thumbs-progress`. Returns how many were made.
#[tauri::command]
async fn clear_cache(app: tauri::AppHandle) -> Res<usize> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = app.state::<Store>();
        storage::clear_thumbs(&s.files);
        storage::rebuild_thumbs(&s.files, &|p| { let _ = app.emit("thumbs-progress", p); })
    })
    .await
    .map_err(|e| e.to_string())
}

/// Points the app at an existing library folder (one with a remind-library.json) and restarts.
#[tauri::command]
fn locate_library(app: tauri::AppHandle, s: State<Store>, path: String) -> Res<()> {
    let p = PathBuf::from(path);
    if !p.join(storage::MARKER).exists() { return Err("That folder is not a REMind library (no remind-library.json).".into()) }
    let mut settings = s.settings.lock().map_err(|_| "settings lock poisoned".to_string())?;
    settings.library_dir = Some(p);
    settings.save(&s.config_dir)?;
    drop(settings);
    app.restart()
}

/// Forgets a missing library and uses the built-in one.
#[tauri::command]
fn use_default_library(app: tauri::AppHandle, s: State<Store>) -> Res<()> {
    let mut settings = s.settings.lock().map_err(|_| "settings lock poisoned".to_string())?;
    settings.library_dir = None;
    settings.save(&s.config_dir)?;
    drop(settings);
    app.restart()
}

#[derive(serde::Serialize)]
struct Analysis {
    scores: Vec<Scored>,
    detail: Vec<Scored>,
}

/// Embeds the stored image (the vector stays in Rust: database + search index) and returns the zero-shot scores the UI
/// turns into type tags. `spaces` = (prompt, parent) pairs.
#[tauri::command]
async fn analyze_asset(app: tauri::AppHandle, s: State<'_, Store>, id: String, types: Vec<String>, spaces: Vec<(String, String)>) -> Res<Analysis> {
    // Thumbnail first (it is what the TS pipeline analysed); fall back to the original.
    let path = s.files.find_thumb(&id).or_else(|| s.files.find_original(&id)).ok_or("image file not found")?;
    let work = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || -> Res<(Vec<f32>, Analysis)> {
            let s = app.state::<Store>();
            let img = import::decode(&std::fs::read(&path).map_err(|e| e.to_string())?)?;
            let mut guard = s.analyzer()?;
            let (emb, scores, detail) = guard.as_mut().unwrap().analyze(&img, &types, &spaces)?;
            Ok((emb, Analysis { scores, detail }))
        }
    });
    let (emb, analysis) = work.await.map_err(|e| e.to_string())??;
    s.db()?.put_embedding(&id, EMBEDDING_MODEL, &emb)?;
    if let Some(index) = s.index.lock().map_err(|_| "index lock poisoned")?.as_mut() {
        index.insert(id, emb);
    }
    Ok(analysis)
}

/// Search by meaning: [(asset id, score)], best first. `prompt` is already "a photo of ...".
#[tauri::command]
async fn search_meaning(app: tauri::AppHandle, prompt: String) -> Res<Vec<(String, f32)>> {
    tauri::async_runtime::spawn_blocking(move || -> Res<Vec<(String, f32)>> {
        let s = app.state::<Store>();
        let q = s.analyzer()?.as_mut().unwrap().embed_text(&prompt)?;
        let mut index = s.index.lock().map_err(|_| "index lock poisoned".to_string())?;
        if index.is_none() {
            *index = Some(s.db()?.embeddings(EMBEDDING_MODEL)?.into_iter().collect());
        }
        Ok(analyze::search::matches(&q, index.as_ref().unwrap()))
    })
    .await
    .map_err(|e| e.to_string())?
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
            let default_cache = app.path().app_cache_dir()?.join("cache");
            let (settings, paths) = storage::resolve(&root, &default_cache);
            if paths.missing.is_none() { storage::ensure_marker(&paths.library, None)? }
            let db = Db::open(&paths.library.join("board.sqlite"))?;
            // Thumbnails from before 0.6 sat inside the library: move them to the cache folder in the background.
            let legacy = root.join("library").join("thumbs");
            if legacy.exists() {
                let to = paths.thumbs.clone();
                let from = legacy.clone();
                std::thread::spawn(move || storage::move_legacy_thumbs(&from, &to));
            }
            for dir in [&paths.originals, &paths.thumbs] {
                std::fs::create_dir_all(dir)?;
                app.asset_protocol_scope().allow_directory(dir, true)?;
            }
            // Bundled model (installer resources); a dev run from the repo falls back to the checked-out copy.
            let rel = "resources/models/siglip-base-patch16-224";
            let model_dir = app.path().resolve(rel, tauri::path::BaseDirectory::Resource)?;
            let model_dir = if model_dir.join("tokenizer.json").exists() { model_dir } else { PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel) };
            app.manage(Store { db: Mutex::new(db), files: Files { originals: paths.originals.clone(), thumbs: paths.thumbs.clone(), legacy_thumbs: Some(legacy) }, paths, config_dir: root, default_cache, settings: Mutex::new(settings), moving: AtomicBool::new(false), cancel_move: AtomicBool::new(false), model_dir, analyzer: Mutex::new(None), index: Mutex::new(None), launch_file: Mutex::new(std::env::args().skip(1).find(|a| a.to_lowercase().ends_with(".bo"))) });
            Ok(())
        })
        .on_window_event(|w, e| { if let tauri::WindowEvent::Resized(_) = e { if w.label() == "main" { layout(w.app_handle()); } } })
        .invoke_handler(tauri::generate_handler![
            load_all, save_boards, save_assets, save_placements, save_connections, save_categories, delete_board,
            delete_assets, delete_placements, delete_connections, delete_category, clear_all, add_asset, save_thumb, import_image,
            asset_paths, meta_get, meta_set, analyze_asset, search_meaning, export_bo, import_bo, take_launch_file, toggle_pinterest, set_pinterest_width,
            storage_info, move_library, cancel_move, delete_old_library, set_cache_dir, clear_cache, locate_library, use_default_library
        ])
        .run(tauri::generate_context!())
        .expect("error while running REMind");
}
