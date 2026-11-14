// REMind desktop shell. The app itself is the web build in ../dist; Rust only hosts it and provides the plugins the
// web code needs: http (fetch LIT Awards and link previews without CORS), dialog + fs (native Save for .bo and exports),
// opener (open links in the system browser).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running REMind");
}
