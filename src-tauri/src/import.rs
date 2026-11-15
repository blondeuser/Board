// Image import core (docs/RUST_BACKEND.md step 2): hash, decode (EXIF-rotated), 1280px thumbnail, palette + colour families.
// No Tauri types, so `cargo test` covers it.
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

/// Downscale so the long side is `max` (SIMD, CatmullRom). Images with transparency go through the slower `image` filter,
/// which handles alpha correctly.
fn shrink(img: DynamicImage, max: u32) -> DynamicImage {
    use fast_image_resize::{images::Image, FilterType as F, PixelType, ResizeAlg, ResizeOptions, Resizer};
    let (w, h) = (img.width(), img.height());
    if w.max(h) <= max {
        return img;
    }
    let scale = max as f64 / w.max(h) as f64;
    let (dw, dh) = (((w as f64 * scale).round() as u32).max(1), ((h as f64 * scale).round() as u32).max(1));
    if img.color().has_alpha() {
        return img.resize(max, max, FilterType::CatmullRom);
    }
    let rgb = img.to_rgb8();
    let done = Image::from_vec_u8(w, h, rgb.into_raw(), PixelType::U8x3).ok().and_then(|src| {
        let mut dst = Image::new(dw, dh, PixelType::U8x3);
        Resizer::new().resize(&src, &mut dst, &ResizeOptions::new().resize_alg(ResizeAlg::Convolution(F::CatmullRom))).ok()?;
        image::RgbImage::from_raw(dw, dh, dst.into_vec())
    });
    match done {
        Some(out) => DynamicImage::ImageRgb8(out),
        None => img.resize(max, max, FilterType::CatmullRom), // never lose an import to the fast path
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// Decode with EXIF rotation applied.
pub fn decode(bytes: &[u8]) -> Result<DynamicImage, String> {
    let mut decoder = ImageReader::new(Cursor::new(bytes)).with_guessed_format().map_err(|e| e.to_string())?.into_decoder().map_err(|e| e.to_string())?;
    let orientation = decoder.orientation().map_err(|e| e.to_string())?;
    let mut img = DynamicImage::from_decoder(decoder).map_err(|e| e.to_string())?;
    img.apply_orientation(orientation);
    Ok(img)
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

    // One big downscale (to the 1280px display size); the palette is taken from that, not from the full 12 MP image.
    let display = shrink(img, THUMB_MAX);
    let small = display.resize(64, 64, FilterType::Triangle).to_rgba8();
    let palette = extract_palette(small.as_raw(), small.width() as usize, small.height() as usize, 5);
    let colors = color_families(&palette);
    let palette = Value::Array(palette.iter().map(|p| json!({"hex": p.hex, "share": p.share})).collect());

    // A file that needs no shrinking, no rotation and is a web-displayable format is its own thumbnail.
    let thumb = if width.max(height) <= THUMB_MAX && orientation == image::metadata::Orientation::NoTransforms && ext != "bmp" {
        (ext.to_string(), bytes.to_vec())
    } else {
        let t = display;
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

/// Timing probe: `cargo test --release bench_import -- --ignored --nocapture`.
#[cfg(test)]
mod bench {
    use super::*;
    use std::time::Instant;

    #[test]
    #[ignore]
    fn bench_import() {
        // A 12 MP photo-like JPEG (smooth gradients plus texture), as a phone or camera would make.
        let img = image::RgbImage::from_fn(4000, 3000, |x, y| {
            let n = ((x * 7 + y * 13) % 29) as u8;
            image::Rgb([(x / 16) as u8 ^ n, (y / 12) as u8 ^ n, ((x + y) / 24) as u8 ^ n])
        });
        let mut jpg = Cursor::new(Vec::new());
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpg, 90).encode_image(&img).unwrap();
        let bytes = jpg.into_inner();
        println!("input: {} KB 4000x3000 jpeg", bytes.len() / 1024);
        analyze(&bytes).unwrap();
        let t = Instant::now();
        for _ in 0..5 { analyze(&bytes).unwrap(); }
        println!("import analyze (decode + thumb + palette + hash): {:?} per 12 MP image", t.elapsed() / 5);
        let t = Instant::now();
        for _ in 0..5 { sha256_hex(&bytes); }
        println!("  of which sha256: {:?}", t.elapsed() / 5);
        let t = Instant::now();
        for _ in 0..5 { decode(&bytes).unwrap(); }
        println!("  of which decode: {:?}", t.elapsed() / 5);
    }
}
