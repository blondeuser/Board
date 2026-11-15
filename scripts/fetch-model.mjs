// Downloads the SigLIP files the Rust backend bundles into src-tauri/resources/models/<id>/ (not committed: ~210 MB).
// Usage: node scripts/fetch-model.mjs   (run once before `cargo test` / `npm run tauri build`)
import fs from 'node:fs'
import path from 'node:path'

const base = 'https://huggingface.co/Xenova/siglip-base-patch16-224/resolve/main/'
const dir = 'src-tauri/resources/models/siglip-base-patch16-224'
const files = { 'onnx/vision_model_quantized.onnx': 'vision_model_quantized.onnx', 'onnx/text_model_quantized.onnx': 'text_model_quantized.onnx', 'tokenizer.json': 'tokenizer.json' }
fs.mkdirSync(dir, { recursive: true })
for (const [remote, local] of Object.entries(files)) {
  const target = path.join(dir, local)
  if (fs.existsSync(target)) continue
  const res = await fetch(base + remote)
  if (!res.ok) throw new Error(`${remote}: ${res.status}`)
  fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()))
  console.log('downloaded', local)
}
console.log('model ready in', dir)
