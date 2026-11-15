// Library files on disk: <originals>/<id>.<ext> in the library folder, <thumbs>/<id>.<ext> in the cache folder (docs/STORAGE.md).
// Atomic writes (.tmp + rename).
// shortcut: named by asset id; switch to <hash> if files should be shared across duplicates.
use std::path::{Path, PathBuf};

pub struct Files {
    pub originals: PathBuf,
    pub thumbs: PathBuf,
    /// Pre-0.6 thumbnail folder (inside the library); read as a fallback until its files have moved to `thumbs`.
    pub legacy_thumbs: Option<PathBuf>,
}

impl Files {
    pub fn original(&self, id: &str, ext: &str) -> PathBuf {
        self.originals.join(format!("{}.{}", safe(id), safe(ext)))
    }
    pub fn thumb(&self, id: &str, ext: &str) -> PathBuf {
        self.thumbs.join(format!("{}.{}", safe(id), safe(ext)))
    }

    /// A file's path whatever its extension.
    fn find(dir: &Path, id: &str) -> Option<PathBuf> {
        let id = safe(id);
        std::fs::read_dir(dir).ok()?.flatten().map(|f| f.path()).find(|p| p.file_stem().is_some_and(|s| *s == *id))
    }
    pub fn find_original(&self, id: &str) -> Option<PathBuf> {
        Self::find(&self.originals, id)
    }
    pub fn find_thumb(&self, id: &str) -> Option<PathBuf> {
        Self::find(&self.thumbs, id).or_else(|| Self::find(self.legacy_thumbs.as_deref()?, id))
    }

    pub fn write(path: &Path, bytes: &[u8]) -> Result<(), String> {
        let dir = path.parent().ok_or("bad path")?;
        std::fs::create_dir_all(dir).map_err(|x| x.to_string())?;
        let tmp = path.with_extension("tmp");
        std::fs::write(&tmp, bytes).map_err(|x| x.to_string())?;
        std::fs::rename(&tmp, path).map_err(|x| x.to_string())
    }

    /// Removes an image's files; a missing file is fine.
    pub fn remove_asset(&self, id: &str) {
        let dirs = [Some(&self.originals), Some(&self.thumbs), self.legacy_thumbs.as_ref()];
        for dir in dirs.into_iter().flatten() {
            while let Some(p) = Self::find(dir, id) {
                if std::fs::remove_file(p).is_err() { break }
            }
        }
    }
}
/// Ids and extensions come from the UI: keep only file-name-safe characters so they can't escape the library folder.
fn safe(s: &str) -> String {
    s.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_').collect()
}

/// Splits the add_asset body: u32 BE json length | json | u32 BE thumb length | thumb | original bytes.
pub fn split_frame(b: &[u8]) -> Result<(&[u8], &[u8], &[u8]), String> {
    fn take(b: &[u8]) -> Result<(&[u8], &[u8]), String> {
        let n = u32::from_be_bytes(b.get(..4).ok_or("short body")?.try_into().unwrap()) as usize;
        let rest = &b[4..];
        if rest.len() < n { return Err("short body".into()); }
        Ok(rest.split_at(n))
    }
    let (json, rest) = take(b)?;
    let (thumb, original) = take(rest)?;
    Ok((json, thumb, original))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frame_splits_and_rejects_short_bodies() {
        let mut b = vec![0, 0, 0, 2];
        b.extend(b"{}");
        b.extend([0, 0, 0, 3]);
        b.extend(b"abc");
        b.extend(b"ORIGINAL");
        assert_eq!(split_frame(&b).unwrap(), (&b"{}"[..], &b"abc"[..], &b"ORIGINAL"[..]));
        assert!(split_frame(&b[..9]).is_err());
        assert!(split_frame(&[]).is_err());
    }

    #[test]
    fn ids_cannot_escape_the_library() {
        let f = Files { originals: PathBuf::from("lib").join("originals"), thumbs: PathBuf::from("lib").join("thumbs"), legacy_thumbs: None };
        let p = f.original("../../x", "jp/g");
        assert_eq!(p, PathBuf::from("lib").join("originals").join("x.jpg"));
    }

    #[test]
    fn write_and_remove() {
        let root = std::env::temp_dir().join(format!("remind-files-test-{}", std::process::id()));
        let f = Files { originals: root.join("originals"), thumbs: root.join("thumbs"), legacy_thumbs: None };
        Files::write(&f.original("a1", "jpg"), b"o").unwrap();
        Files::write(&f.thumb("a1", "jpg"), b"t").unwrap();
        assert!(f.original("a1", "jpg").exists() && f.find_thumb("a1").is_some());
        f.remove_asset("a1");
        assert!(!f.original("a1", "jpg").exists() && f.find_thumb("a1").is_none());
        std::fs::remove_dir_all(root).ok();
    }
}
