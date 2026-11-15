// Image import core (docs/RUST_BACKEND.md step 2): hash, decode (EXIF-rotated), 1280px thumbnail, palette + colour families.
// No Tauri types, so `cargo test` covers it.
// shortcut: resizing uses image's CatmullRom filter, not fast_image_resize; switch if import speed measures too slow.
use crate::color::{color_families, extract_palette};
use image::{imageops::FilterType, DynamicImage, ImageDecoder, ImageFormat, ImageReader};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::Cursor;

const THUMB_MAX: u32 = 1280;

pub struct Analyzed {
    pub hash: String,
    pub ext: &'static str,
    pub width: u32,
    pub height: u32,
    pub palette: Value,
    pub colors: Vec<&'static str>,
    /// (extension, bytes) of the display-size copy. Small images use the original bytes.
    pub thumb: (String, Vec<u8>),
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn analyze(bytes: &[u8]) -> Result<Analyzed, String> {
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format().map_err(|e| e.to_string())?;
    let format = reader.format().ok_or("not an image")?;
    let ext = match format {
        ImageFormat::Jpeg => "jpg",
        ImageFormat::Png => "png",
        ImageFormat::WebP => "webp",
        ImageFormat::Gif => "gif",
        ImageFormat::Bmp => "bmp",
        _ => return Err("unsupported image format".into()),
    };
    let mut decoder = reader.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    img.apply_orientation(orientation);
    let (width, height) = (img.width(), img.height());

    let small = img.resize(64, 64, FilterType::Triangle).to_rgba8();
    let palette = extract_palette(small.as_raw(), small.width() as usize, small.height() as usize, 5);
    let colors = color_families(&palette);
    let palette = Value::Array(palette.iter().map(|p| json!({"hex": p.hex, "share": p.share})).collect());

    // A file that needs no shrinking, no rotation and is a web-displayable format is its own thumbnail.
    let thumb = if width.max(height) <= THUMB_MAX && orientation == image::metadata::Orientation::NoTransforms && ext != "bmp" {
        (ext.to_string(), bytes.to_vec())
    } else {
        let t = if width.max(height) > THUMB_MAX { img.resize(THUMB_MAX, THUMB_MAX, FilterType::CatmullRom) } else { img };
        let mut out = Cursor::new(Vec::new());
        if t.color().has_alpha() && t.to_rgba8().pixels().any(|p| p.0[3] < 255) {
            t.write_to(&mut out, ImageFormat::Png).map_err(|e| e.to_string())?;
            ("png".to_string(), out.into_inner())
        } else {
            image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 88)
                .encode_image(&t.to_rgb8()).map_err(|e| e.to_string())?;
            ("jpg".to_string(), out.into_inner())
        }
    };
    Ok(Analyzed { hash: sha256_hex(bytes), ext, width, height, palette, colors, thumb })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png(w: u32, h: u32, px: [u8; 4]) -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(w, h, image::Rgba(px));
        let mut out = Cursor::new(Vec::new());
        DynamicImage::ImageRgba8(img).write_to(&mut out, ImageFormat::Png).unwrap();
        out.into_inner()
    }

    #[test]
    fn hash_matches_known_value() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn small_image_is_its_own_thumbnail() {
        let b = png(100, 50, [255, 0, 0, 255]);
        let a = analyze(&b).unwrap();
        assert_eq!((a.width, a.height, a.ext), (100, 50, "png"));
        assert_eq!(a.colors, vec!["red"]);
        assert_eq!(a.thumb, ("png".to_string(), b));
    }

    #[test]
    fn big_image_gets_a_1280_thumbnail() {
        let a = analyze(&png(2560, 1280, [0, 0, 255, 255])).unwrap();
        assert_eq!((a.width, a.height), (2560, 1280));
        assert_eq!(a.thumb.0, "jpg");
        let t = image::load_from_memory(&a.thumb.1).unwrap();
        assert_eq!((t.width(), t.height()), (1280, 640));
    }

    #[test]
    fn garbage_is_an_error() {
        assert!(analyze(b"not an image").is_err());
    }
}
