// On-device SigLIP (docs/RUST_BACKEND.md step 3): image + text embeddings through ONNX Runtime (`ort`).
// No Tauri types, so `cargo test` covers it. Preprocessing must match the transformers.js processor
// (resize 224x224 bicubic, rescale 1/255, normalise mean 0.5 / std 0.5).
pub mod search;

use image::DynamicImage;
use std::collections::HashMap;
use ort::{session::Session, value::Tensor};
use std::path::Path;
use tokenizers::Tokenizer;

/// Embeddings made by another model are not comparable: stored with this id (same as src/categorize/style/model.ts).
pub const EMBEDDING_MODEL: &str = "siglip-base-patch16-224";
const SIZE: u32 = 224;
const TEXT_LEN: usize = 64;

pub struct Model {
    vision: Session,
    text: Session,
    tokenizer: Tokenizer,
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Plain 2x2 bilinear sampling at pixel centres, with no pre-filtering: what the browser's canvas drawImage does at the
/// default quality, which is how the TS pipeline resized images. The q8 model reacts to the resize, so this matters.
fn resize_bilinear(src: &image::RgbImage, size: u32) -> image::RgbImage {
    let (w, h) = (src.width() as f32, src.height() as f32);
    let at = |x: i64, y: i64, c: usize| src.get_pixel(x.clamp(0, w as i64 - 1) as u32, y.clamp(0, h as i64 - 1) as u32).0[c] as f32;
    image::RgbImage::from_fn(size, size, |x, y| {
        let sx = (x as f32 + 0.5) * w / size as f32 - 0.5;
        let sy = (y as f32 + 0.5) * h / size as f32 - 0.5;
        let (x0, y0) = (sx.floor(), sy.floor());
        let (fx, fy) = (sx - x0, sy - y0);
        let mut px = [0u8; 3];
        for c in 0..3 {
            let top = at(x0 as i64, y0 as i64, c) * (1.0 - fx) + at(x0 as i64 + 1, y0 as i64, c) * fx;
            let bot = at(x0 as i64, y0 as i64 + 1, c) * (1.0 - fx) + at(x0 as i64 + 1, y0 as i64 + 1, c) * fx;
            px[c] = (top * (1.0 - fy) + bot * fy).round() as u8;
        }
        image::Rgb(px)
    })
}

fn normalize(mut v: Vec<f32>) -> Vec<f32> {
    let n = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    let n = if n == 0.0 { 1.0 } else { n };
    v.iter_mut().for_each(|x| *x /= n);
    v
}

impl Model {
    /// `dir` holds vision_model_quantized.onnx, text_model_quantized.onnx and tokenizer.json.
    pub fn load(dir: &Path) -> Result<Model, String> {
        static ENV: std::sync::OnceLock<Result<ort::environment::Environment, String>> = std::sync::OnceLock::new();
        let env = ENV.get_or_init(|| ort::init().build().map_err(err)).as_ref().map_err(|e| e.clone())?;
        let session = |f: &str| -> Result<Session, String> {
            // CPU only: DirectML crashes on the q8 model and needs the (larger, slower-on-CPU) fp16 files; see PROGRESS 2026-11-15.
            Session::builder(env).map_err(err)?.commit_from_file(dir.join(f)).map_err(err)
        };
        let mut tokenizer = Tokenizer::from_file(dir.join("tokenizer.json")).map_err(err)?;
        // Same as transformers.js for SigLIP: pad to 64 tokens, truncate.
        tokenizer
            .with_padding(Some(tokenizers::PaddingParams {
                strategy: tokenizers::PaddingStrategy::Fixed(TEXT_LEN),
                pad_id: 1, // SigLIP pads with </s>, not [PAD]
                pad_token: "</s>".into(),
                ..Default::default()
            }))
            .with_truncation(Some(tokenizers::TruncationParams { max_length: TEXT_LEN, ..Default::default() }))
            .map_err(err)?;
        Ok(Model { vision: session("vision_model_quantized.onnx")?, text: session("text_model_quantized.onnx")?, tokenizer })
    }

    pub fn io_names(&self) -> String {
        let f = |s: &Session| {
            format!(
                "in {:?} out {:?}",
                s.inputs().iter().map(|i| i.name().to_string()).collect::<Vec<_>>(),
                s.outputs().iter().map(|o| o.name().to_string()).collect::<Vec<_>>()
            )
        };
        format!("vision: {} | text: {}", f(&self.vision), f(&self.text))
    }

    /// Unit-length image embedding.
    pub fn embed_image(&mut self, img: &DynamicImage) -> Result<Vec<f32>, String> {
        let rgb = resize_bilinear(&img.to_rgb8(), SIZE);
        let n = (SIZE * SIZE) as usize;
        let mut data = vec![0f32; 3 * n];
        for (i, p) in rgb.pixels().enumerate() {
            for c in 0..3 {
                data[c * n + i] = (p.0[c] as f32 / 255.0 - 0.5) / 0.5;
            }
        }
        let input = Tensor::from_array(([1usize, 3, SIZE as usize, SIZE as usize], data)).map_err(err)?;
        let out = self.vision.run(ort::inputs!["pixel_values" => input]).map_err(err)?;
        let (_, v) = out["pooler_output"].try_extract_tensor::<f32>().map_err(err)?;
        Ok(normalize(v.to_vec()))
    }

    /// Unit-length text embeddings, one per input.
    pub fn embed_texts(&mut self, texts: &[&str]) -> Result<Vec<Vec<f32>>, String> {
        let enc = self.tokenizer.encode_batch(texts.to_vec(), true).map_err(err)?;
        let ids: Vec<i64> = enc.iter().flat_map(|e| e.get_ids().iter().map(|&i| i as i64)).collect();
        let input = Tensor::from_array(([texts.len(), TEXT_LEN], ids)).map_err(err)?;
        let out = self.text.run(ort::inputs!["input_ids" => input]).map_err(err)?;
        let (shape, v) = out["pooler_output"].try_extract_tensor::<f32>().map_err(err)?;
        let dim = shape[1] as usize;
        Ok(v.chunks(dim).map(|c| normalize(c.to_vec())).collect())
    }
}

/// A prompt and its softmax probability (same shape the TS worker returned).
#[derive(serde::Serialize, Clone)]
pub struct Scored {
    pub label: String,
    pub score: f32,
}

const LOGIT_SCALE: f32 = 100.0; // softmax temperature for the type scores, as in the TS worker

fn softmax(image: &[f32], prompts: &[&String], embs: &[&Vec<f32>]) -> Vec<Scored> {
    let logits: Vec<f32> = embs.iter().map(|e| LOGIT_SCALE * image.iter().zip(*e).map(|(a, b)| a * b).sum::<f32>()).collect();
    let max = logits.iter().cloned().fold(f32::MIN, f32::max);
    let exps: Vec<f32> = logits.iter().map(|l| (l - max).exp()).collect();
    let sum: f32 = exps.iter().sum();
    prompts.iter().zip(exps).map(|(p, e)| Scored { label: (*p).clone(), score: e / sum }).collect()
}

/// The model plus a cache of text embeddings (label prompts are embedded once, not per image).
pub struct Analyzer {
    model: Model,
    texts: HashMap<String, Vec<f32>>,
}

impl Analyzer {
    pub fn new(model: Model) -> Analyzer {
        Analyzer { model, texts: HashMap::new() }
    }

    pub fn embed_text(&mut self, text: &str) -> Result<Vec<f32>, String> {
        self.embed_texts_cached(&[text.to_string()]).map(|mut v| v.remove(0))
    }

    fn embed_texts_cached(&mut self, texts: &[String]) -> Result<Vec<Vec<f32>>, String> {
        let missing: Vec<&str> = texts.iter().filter(|t| !self.texts.contains_key(*t)).map(|t| t.as_str()).collect();
        if !missing.is_empty() {
            let embs = self.model.embed_texts(&missing)?;
            for (t, e) in missing.iter().zip(embs) {
                self.texts.insert(t.to_string(), e);
            }
        }
        Ok(texts.iter().map(|t| self.texts[t].clone()).collect())
    }

    /// Image embedding plus zero-shot scores: one softmax over the type prompts, and one softmax per parent group of the
    /// finer space prompts ((prompt, parent) pairs), so the groups don't compete.
    pub fn analyze(&mut self, img: &DynamicImage, types: &[String], spaces: &[(String, String)]) -> Result<(Vec<f32>, Vec<Scored>, Vec<Scored>), String> {
        let image = self.model.embed_image(img)?;
        let type_embs = self.embed_texts_cached(types)?;
        let space_prompts: Vec<String> = spaces.iter().map(|s| s.0.clone()).collect();
        let space_embs = self.embed_texts_cached(&space_prompts)?;
        let scores = softmax(&image, &types.iter().collect::<Vec<_>>(), &type_embs.iter().collect::<Vec<_>>());
        let mut parents: Vec<&String> = vec![];
        spaces.iter().for_each(|s| if !parents.contains(&&s.1) { parents.push(&s.1) });
        let detail = parents
            .iter()
            .flat_map(|parent| {
                let idx: Vec<usize> = (0..spaces.len()).filter(|&i| spaces[i].1 == **parent).collect();
                softmax(&image, &idx.iter().map(|&i| &spaces[i].0).collect::<Vec<_>>(), &idx.iter().map(|&i| &space_embs[i]).collect::<Vec<_>>())
            })
            .collect();
        Ok((image, scores, detail))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn model_dir() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/models/siglip-base-patch16-224")
    }
    fn fixtures() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/siglip")
    }
    /// One model for all tests (loading takes a moment).
    fn model() -> std::sync::MutexGuard<'static, Model> {
        static M: OnceLock<Mutex<Model>> = OnceLock::new();
        M.get_or_init(|| Mutex::new(Model::load(&model_dir()).unwrap())).lock().unwrap()
    }
    fn cos(a: &[f32], b: &[f64]) -> f64 {
        a.iter().zip(b).map(|(x, y)| *x as f64 * y).sum()
    }
    fn reference() -> serde_json::Value {
        serde_json::from_slice(&std::fs::read(fixtures().join("reference.json")).unwrap()).unwrap()
    }
    fn vec_of(v: &serde_json::Value) -> Vec<f64> {
        v.as_array().unwrap().iter().map(|x| x.as_f64().unwrap()).collect()
    }

    #[test]
    fn shapes() {
        let mut m = model();
        let t = m.embed_texts(&["a photo of a cat", "a photograph"]).unwrap();
        assert_eq!((t.len(), t[0].len()), (2, 768));
        assert_eq!(m.embed_image(&DynamicImage::new_rgb8(300, 200)).unwrap().len(), 768);
    }

    /// Parity with the TS model (scripts/make-siglip-fixtures.mjs): the plan requires cosine > 0.99.
    #[test]
    fn text_embeddings_match_transformers_js() {
        let (mut m, r) = (model(), reference());
        for (text, want) in r["texts"].as_object().unwrap() {
            let got = m.embed_texts(&[text.as_str()]).unwrap().remove(0);
            let c = cos(&got, &vec_of(want));
            println!("text {text:?}: cosine {c:.5}");
            assert!(c > 0.99, "{text}: {c}");
        }
    }

    #[test]
    fn image_embeddings_match_transformers_js() {
        let (mut m, r) = (model(), reference());
        let mut worst = 1.0f64;
        for (file, want) in r["images"].as_object().unwrap() {
            let img = image::open(fixtures().join(file)).unwrap();
            let c = cos(&m.embed_image(&img).unwrap(), &vec_of(want));
            println!("image {file}: cosine {c:.5}");
            worst = worst.min(c);
        }
        assert!(worst > 0.99, "worst image cosine {worst}");
    }
}

/// Timing probe: `cargo test --release bench -- --ignored --nocapture`.
#[cfg(test)]
mod bench {
    use super::*;
    use std::time::Instant;

    #[test]
    #[ignore]
    fn bench() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR"));
        let t = Instant::now();
        let mdir = std::env::var_os("REMIND_MODEL_DIR").map(std::path::PathBuf::from).unwrap_or_else(|| dir.join("resources/models/siglip-base-patch16-224"));
        let mut m = Model::load(&mdir).unwrap();
        println!("model load: {:?}", t.elapsed());
        let imgs: Vec<DynamicImage> = ["aloeL", "baboon", "butterfly", "fruits", "messi5", "starry_night"]
            .iter().map(|n| image::open(dir.join(format!("../tests/fixtures/siglip/{n}.jpg"))).unwrap()).collect();
        m.embed_image(&imgs[0]).unwrap(); // warm up
        let t = Instant::now();
        for _ in 0..5 { for i in &imgs { m.embed_image(i).unwrap(); } }
        println!("embed_image: {:?} per image (30 images, sequential)", t.elapsed() / 30);
    }
}
