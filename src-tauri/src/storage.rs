// Where the library and cache live, moving them, clearing the cache (docs/STORAGE.md). No Tauri types: `cargo test` covers it.
// shortcut: no drive-type (network) or free-space check beyond refusing \\server paths; those need windows-sys / libc (not approved).
// A failed copy is caught by the verify step and cleaned up instead.
use crate::{db::Db, files::Files, import, settings::Settings};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::atomic::{AtomicBool, Ordering},
};

type Res<T> = Result<T, String>;
pub const MARKER: &str = "remind-library.json";

pub struct Resolved {
    pub library: PathBuf,
    pub originals: PathBuf,
    pub cache: PathBuf,
    pub thumbs: PathBuf,
    /// The built-in library folder (the config folder itself). Its originals sit in `library/originals` (pre-0.6 layout).
    pub default_library: PathBuf,
    /// A library the settings point to that could not be found.
    pub missing: Option<PathBuf>,
}

#[derive(Serialize, Clone)]
pub struct Progress {
    pub phase: &'static str,
    pub done: usize,
    pub total: usize,
}

/// Originals folder of a library: the default library keeps the old `library/originals`, any other folder uses `originals`.
pub fn originals_dir(lib: &Path, default_lib: &Path) -> PathBuf {
    if same(lib, default_lib) { lib.join("library").join("originals") } else { lib.join("originals") }
}

fn norm(p: &Path) -> String {
    let abs = std::path::absolute(p).unwrap_or_else(|_| p.to_path_buf());
    abs.to_string_lossy().replace('/', "\\").trim_end_matches('\\').to_lowercase()
}
fn same(a: &Path, b: &Path) -> bool {
    norm(a) == norm(b)
}
/// `a` is `b` or lies inside it.
fn inside(a: &Path, b: &Path) -> bool {
    let (a, b) = (norm(a), norm(b));
    a == b || a.starts_with(&format!("{b}\\"))
}

pub fn resolve(config_dir: &Path, default_cache: &Path) -> (Settings, Resolved) {
    let settings = Settings::load(config_dir);
    let (library, missing) = match &settings.library_dir {
        Some(p) if p.join(MARKER).exists() => (p.clone(), None),
        Some(p) => (config_dir.to_path_buf(), Some(p.clone())),
        None => (config_dir.to_path_buf(), None),
    };
    let writable = |p: &Path| std::fs::create_dir_all(p).is_ok();
    let cache = settings.cache_dir.clone().filter(|p| writable(p)).unwrap_or_else(|| default_cache.to_path_buf());
    let r = Resolved {
        originals: originals_dir(&library, config_dir),
        thumbs: cache.join("thumbs"),
        library,
        cache,
        default_library: config_dir.to_path_buf(),
        missing,
    };
    (settings, r)
}

/// Writes `remind-library.json` if the folder has none (the default library gets one on first start of 0.6).
pub fn ensure_marker(lib: &Path, id: Option<String>) -> Res<()> {
    let p = lib.join(MARKER);
    if p.exists() {
        return Ok(());
    }
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64);
    let m = serde_json::json!({ "app": "REMind", "libraryVersion": 1, "id": id.unwrap_or_else(crate::bo::new_id), "createdAt": now });
    std::fs::create_dir_all(lib).map_err(|e| e.to_string())?;
    std::fs::write(p, m.to_string()).map_err(|e| e.to_string())
}

fn marker_id(lib: &Path) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(lib.join(MARKER)).ok()?).ok()?;
    v["id"].as_str().map(str::to_string)
}

/// Total size of the files under `p` (0 when missing).
pub fn folder_size(p: &Path) -> u64 {
    let Ok(rd) = std::fs::read_dir(p) else { return std::fs::metadata(p).map_or(0, |m| m.len()) };
    rd.flatten()
        .map(|e| match e.metadata() {
            Ok(m) if m.is_dir() => folder_size(&e.path()),
            Ok(m) => m.len(),
            Err(_) => 0,
        })
        .sum()
}

/// Is this folder fit to receive the library (or cache)? Creates it when missing.
pub fn check_target(target: &Path, current_lib: &Path, cache: &Path, is_library: bool) -> Res<()> {
    let s = target.to_string_lossy();
    if is_library && (s.starts_with("\\\\") || s.starts_with("//")) {
        return Err("The library can't live on a network folder (the database could get corrupted). Pick a drive in this computer.".into());
    }
    if inside(target, current_lib) || inside(current_lib, target) || inside(target, cache) || inside(cache, target) {
        return Err("Pick a folder that is not inside the current library or cache, and does not contain them.".into());
    }
    if is_library && target.exists() {
        if target.join(MARKER).exists() {
            return Err("That folder is already a REMind library.".into());
        }
        if std::fs::read_dir(target).map_err(|e| e.to_string())?.next().is_some() {
            return Err("Pick an empty folder.".into());
        }
    }
    std::fs::create_dir_all(target).map_err(|_| "Can't create that folder.".to_string())?;
    let probe = target.join(".remind-write-test");
    std::fs::write(&probe, b"x").map_err(|_| "That folder is not writable.".to_string())?;
    std::fs::remove_file(probe).ok();
    Ok(())
}

/// Copies one file and checks the copy by hashing both.
fn copy_verified(src: &Path, dst: &Path) -> Res<()> {
    let bytes = std::fs::read(src).map_err(|e| e.to_string())?;
    Files::write(dst, &bytes)?;
    let back = std::fs::read(dst).map_err(|e| e.to_string())?;
    if import::sha256_hex(&bytes) != import::sha256_hex(&back) {
        return Err("A copied image did not match its original.".into());
    }
    Ok(())
}

fn files_in(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir).map(|rd| rd.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect()).unwrap_or_default()
}

/// Copy → verify → switch (docs/STORAGE.md "Moving the library"). Any failure or cancel deletes the new folder and changes nothing.
pub fn move_library(db: &Db, cur: &Resolved, config_dir: &Path, settings: &mut Settings, target: &Path, progress: &dyn Fn(Progress), cancel: &AtomicBool) -> Res<()> {
    check_target(target, &cur.library, &cur.cache, true)?;
    let copy = || -> Res<()> {
        db.backup_to(&target.join("board.sqlite"))?;
        let files = files_in(&cur.originals);
        let dest = originals_dir(target, &cur.default_library);
        for (i, f) in files.iter().enumerate() {
            if cancel.load(Ordering::Relaxed) {
                return Err("Cancelled.".into());
            }
            copy_verified(f, &dest.join(f.file_name().ok_or("bad file name")?))?;
            progress(Progress { phase: "copy", done: i + 1, total: files.len() });
        }
        ensure_marker(target, marker_id(&cur.library))?;
        progress(Progress { phase: "verify", done: 0, total: 0 });
        let copy_db = Db::open(&target.join("board.sqlite"))?;
        if !copy_db.integrity_ok()? || copy_db.row_counts()? != db.row_counts()? {
            return Err("The copied database did not match the original.".into());
        }
        Ok(())
    };
    if let Err(e) = copy() {
        let _ = std::fs::remove_dir_all(target);
        return Err(e);
    }
    settings.previous_library_dir = Some(cur.library.clone());
    settings.library_dir = Some(target.to_path_buf());
    settings.save(config_dir)
}

/// Removes the library left behind by the last move: only the files the app owns, never the folder's other contents.
pub fn delete_old_library(cur: &Resolved, config_dir: &Path, settings: &mut Settings) -> Res<()> {
    let prev = settings.previous_library_dir.clone().ok_or("There is no old library to delete.")?;
    if same(&prev, &cur.library) {
        return Err("That is the library in use.".into());
    }
    for f in ["board.sqlite", "board.sqlite-wal", "board.sqlite-shm", MARKER] {
        let _ = std::fs::remove_file(prev.join(f));
    }
    let _ = std::fs::remove_dir_all(originals_dir(&prev, &cur.default_library));
    let _ = std::fs::remove_dir_all(prev.join("library").join("thumbs"));
    let _ = std::fs::remove_dir(prev.join("library")); // only if empty
    if !same(&prev, &cur.default_library) {
        let _ = std::fs::remove_dir(&prev);
    }
    settings.previous_library_dir = None;
    settings.save(config_dir)
}

/// Points the cache at `new` (None = default) and copies the thumbnails over; a failed copy just leaves the cache empty (it rebuilds).
pub fn set_cache_dir(new: Option<&Path>, cur: &Resolved, default_cache: &Path, config_dir: &Path, settings: &mut Settings) -> Res<()> {
    let target = new.unwrap_or(default_cache);
    if same(target, &cur.cache) {
        return Ok(());
    }
    check_target(target, &cur.library, &cur.cache, false)?;
    for f in files_in(&cur.thumbs) {
        let _ = copy_verified(&f, &target.join("thumbs").join(f.file_name().unwrap_or_default()));
    }
    let _ = std::fs::remove_dir_all(&cur.thumbs);
    settings.cache_dir = new.map(Path::to_path_buf);
    settings.save(config_dir)
}

/// One-time move of thumbnails from the pre-0.6 `library/thumbs` into the cache folder.
pub fn move_legacy_thumbs(legacy: &Path, thumbs: &Path) {
    for f in files_in(legacy) {
        let to = thumbs.join(f.file_name().unwrap_or_default());
        if std::fs::create_dir_all(thumbs).is_ok() && std::fs::rename(&f, &to).is_err() && copy_verified(&f, &to).is_ok() {
            let _ = std::fs::remove_file(&f);
        }
    }
    let _ = std::fs::remove_dir(legacy); // only if empty
}

/// Deletes every thumbnail (cache and pre-0.6 folder).
pub fn clear_thumbs(files: &Files) {
    for dir in [Some(&files.thumbs), files.legacy_thumbs.as_ref()].into_iter().flatten() {
        for f in files_in(dir) {
            let _ = std::fs::remove_file(f);
        }
    }
}

/// Makes the thumbnail of every original that has none. Returns how many were made.
/// shortcut: one thread; add rayon (approved) if a 2,000-image rebuild feels slow.
pub fn rebuild_thumbs(files: &Files, progress: &dyn Fn(Progress)) -> usize {
    let todo: Vec<PathBuf> = files_in(&files.originals)
        .into_iter()
        .filter(|p| p.file_stem().and_then(|s| s.to_str()).is_some_and(|id| files.find_thumb(id).is_none()))
        .collect();
    let mut made = 0;
    for (i, p) in todo.iter().enumerate() {
        if let (Some(id), Ok(bytes)) = (p.file_stem().and_then(|s| s.to_str()), std::fs::read(p)) {
            if let Ok(a) = import::analyze(&bytes) {
                if Files::write(&files.thumb(id, &a.thumb.0), &a.thumb.1).is_ok() {
                    made += 1;
                }
            }
        }
        progress(Progress { phase: "thumbs", done: i + 1, total: todo.len() });
    }
    made
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub library: String,
    pub library_bytes: u64,
    pub cache: String,
    pub thumbs_bytes: u64,
    pub previous: Option<(String, u64)>,
    pub missing: Option<String>,
}

pub fn info(r: &Resolved, s: &Settings) -> Info {
    let text = |p: &Path| p.to_string_lossy().into_owned();
    Info {
        library: text(&r.library),
        library_bytes: folder_size(&r.originals) + folder_size(&r.library.join("board.sqlite")),
        cache: text(&r.cache),
        thumbs_bytes: folder_size(&r.thumbs),
        previous: s.previous_library_dir.as_ref().filter(|p| !same(p, &r.library)).map(|p| (text(p), folder_size(&originals_dir(p, &r.default_library)))),
        missing: r.missing.as_ref().map(|p| text(p)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("remind-storage-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn library(config: &Path) -> (Db, Resolved) {
        let (_, r) = resolve(config, &config.join("cache"));
        std::fs::create_dir_all(&r.originals).unwrap();
        std::fs::write(r.originals.join("a1.jpg"), b"photo one").unwrap();
        std::fs::write(r.originals.join("a2.png"), b"photo two").unwrap();
        (Db::open(&config.join("board.sqlite")).unwrap(), r)
    }

    #[test]
    fn move_copies_verifies_and_switches_then_old_library_can_go() {
        let (cfg, dest) = (tmp("cfg"), tmp("dest").join("Lib"));
        let (db, cur) = library(&cfg);
        let mut s = Settings::default();
        move_library(&db, &cur, &cfg, &mut s, &dest, &|_| {}, &AtomicBool::new(false)).unwrap();
        assert_eq!(std::fs::read(dest.join("originals").join("a2.png")).unwrap(), b"photo two");
        assert!(dest.join("board.sqlite").exists() && dest.join(MARKER).exists());
        let (s2, r2) = resolve(&cfg, &cfg.join("cache"));
        assert_eq!(s2.library_dir.as_deref(), Some(dest.as_path()));
        assert!(same(&r2.library, &dest) && r2.missing.is_none());
        drop(db); // after the restart the old database is no longer open
        delete_old_library(&r2, &cfg, &mut s).unwrap();
        assert!(!cfg.join("library").join("originals").exists() && !cfg.join("board.sqlite").exists());
        assert!(cfg.join("settings.json").exists(), "settings.json is never deleted");
    }

    #[test]
    fn refuses_bad_targets_and_cancel_leaves_nothing() {
        let cfg = tmp("cfg2");
        let (db, cur) = library(&cfg);
        let mut s = Settings::default();
        let busy = tmp("busy");
        std::fs::write(busy.join("x.txt"), b"x").unwrap();
        let go = |t: &Path, s: &mut Settings, c: bool| move_library(&db, &cur, &cfg, s, t, &|_| {}, &AtomicBool::new(c));
        assert!(go(&busy, &mut s, false).is_err(), "non-empty");
        assert!(go(&cfg.join("inner"), &mut s, false).is_err(), "inside the current library");
        assert!(go(Path::new("\\\\server\\share\\Lib"), &mut s, false).is_err(), "network");
        let dest = tmp("cancel").join("Lib");
        assert!(go(&dest, &mut s, true).is_err());
        assert!(!dest.exists() && s.library_dir.is_none());
    }

    #[test]
    fn missing_library_is_reported_not_created() {
        let cfg = tmp("cfg3");
        let gone = cfg.join("Unplugged");
        Settings { library_dir: Some(gone.clone()), ..Default::default() }.save(&cfg).unwrap();
        let (_, r) = resolve(&cfg, &cfg.join("cache"));
        assert_eq!(r.missing, Some(gone.clone()));
        assert!(!gone.exists());
    }

    #[test]
    fn legacy_thumbs_move_and_clear_then_rebuild_makes_the_same_names() {
        let root = tmp("thumbs");
        let files = Files { originals: root.join("o"), thumbs: root.join("cache").join("thumbs"), legacy_thumbs: Some(root.join("legacy")) };
        let img = image::RgbaImage::from_pixel(40, 30, image::Rgba([200, 10, 10, 255]));
        let mut png = std::io::Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img).write_to(&mut png, image::ImageFormat::Png).unwrap();
        Files::write(&files.original("p1", "png"), png.get_ref()).unwrap();
        Files::write(&root.join("legacy").join("p1.png"), b"old").unwrap();
        move_legacy_thumbs(files.legacy_thumbs.as_ref().unwrap(), &files.thumbs);
        assert!(files.thumbs.join("p1.png").exists() && !root.join("legacy").exists());
        clear_thumbs(&files);
        assert!(files.find_thumb("p1").is_none());
        assert_eq!(rebuild_thumbs(&files, &|_| {}), 1);
        assert!(files.thumbs.join("p1.png").exists());
    }
}
