// settings.json: the one file that never moves (docs/STORAGE.md). Where the library and cache live; null = default.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub settings_version: u32,
    pub library_dir: Option<PathBuf>,
    pub cache_dir: Option<PathBuf>,
    /// The library folder before the last move, for "Delete old library".
    pub previous_library_dir: Option<PathBuf>,
    /// Keys this version doesn't know are kept when saving.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { settings_version: 1, library_dir: None, cache_dir: None, previous_library_dir: None, extra: Map::new() }
    }
}

impl Settings {
    /// Missing file = defaults. An unreadable one is kept as `settings.json.bad` and defaults are used.
    pub fn load(dir: &Path) -> Settings {
        let p = dir.join("settings.json");
        let Ok(text) = std::fs::read_to_string(&p) else { return Settings::default() };
        serde_json::from_str(&text).unwrap_or_else(|_| {
            let _ = std::fs::rename(&p, dir.join("settings.json.bad"));
            Settings::default()
        })
    }

    /// Atomic: written to a temp file, then renamed.
    pub fn save(&self, dir: &Path) -> Result<(), String> {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        let tmp = dir.join("settings.json.tmp");
        std::fs::write(&tmp, serde_json::to_string_pretty(self).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, dir.join("settings.json")).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_keeps_unknown_keys_and_bad_file_falls_back() {
        let dir = std::env::temp_dir().join(format!("remind-settings-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("settings.json"), r#"{"libraryDir":"M:\\Lib","future":{"a":1}}"#).unwrap();
        let s = Settings::load(&dir);
        assert_eq!(s.library_dir, Some(PathBuf::from("M:\\Lib")));
        s.save(&dir).unwrap();
        let again = Settings::load(&dir);
        assert_eq!(again.extra["future"]["a"], 1);
        std::fs::write(dir.join("settings.json"), "{ nope").unwrap();
        assert_eq!(Settings::load(&dir), Settings::default());
        assert!(dir.join("settings.json.bad").exists());
        std::fs::remove_dir_all(dir).ok();
    }
}
