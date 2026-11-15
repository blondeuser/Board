// Library files on disk: <root>/originals/<id>.<ext>, <root>/thumbs/<id>.webp. Atomic writes (.tmp + rename).
// shortcut: named by asset id; switch to <hash> in step 2 when import hashes in Rust.
use std::path::{Path, PathBuf};

pub struct Files(pub PathBuf);

impl Files {
    pub fn original(&self, id: &str, ext: &str) -> PathBuf {
        self.0.join("originals").join(format!("{}.{}", safe(id), safe(ext)))
    }
    pub fn thumb(&self, id: &str) -> PathBuf {
        self.0.join("thumbs").join(format!("{}.webp", safe(id)))
    }

    /// The original's path whatever its extension.
    pub fn find_original(&self, id: &str) -> Option<PathBuf> {
        let id = safe(id);
        std::fs::read_dir(self.0.join("originals")).ok()?.flatten().map(|f| f.path()).find(|p| p.file_stem().is_some_and(|s| *s == *id))
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
        std::fs::remove_file(self.thumb(id)).ok();
        if let Ok(rd) = std::fs::read_dir(self.0.join("originals")) {
            for f in rd.flatten() {
                if f.path().file_stem().is_some_and(|s| s == safe(id).as_str()) {
                    std::fs::remove_file(f.path()).ok();
                }
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
        let f = Files(PathBuf::from("lib"));
        let p = f.original("../../x", "jp/g");
        assert_eq!(p, PathBuf::from("lib").join("originals").join("x.jpg"));
    }

    #[test]
    fn write_and_remove() {
        let root = std::env::temp_dir().join(format!("remind-files-test-{}", std::process::id()));
        let f = Files(root.clone());
        Files::write(&f.original("a1", "jpg"), b"o").unwrap();
        Files::write(&f.thumb("a1"), b"t").unwrap();
        assert!(f.original("a1", "jpg").exists() && f.thumb("a1").exists());
        f.remove_asset("a1");
        assert!(!f.original("a1", "jpg").exists() && !f.thumb("a1").exists());
        std::fs::remove_dir_all(root).ok();
    }
}
