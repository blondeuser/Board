/// <reference lib="webworker" />
import { AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, SiglipTextModel, SiglipVisionModel, RawImage } from '@huggingface/transformers'
import { TYPE_LABELS, type Scored } from './labels'
import { MODEL } from './model'

// Images never leave the machine; only the model files are downloaded (once, then cached by the browser).
const SIGLIP = MODEL.includes('siglip')
const PROMPTS = TYPE_LABELS.map((t) => t.prompt)
const LOGIT_SCALE = 100 // softmax temperature for the type scores

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Models {
  tokenizer: any
  textModel: any
  processor: any
  visionModel: any
  promptEmbeddings: Float32Array[]
}
let models: Promise<Models> | null = null

const normalize = (v: Float32Array): Float32Array => {
  let n = 0
  for (const x of v) n += x * x
  n = Math.sqrt(n) || 1
  return v.map((x) => x / n)
}
const dot = (a: Float32Array, b: Float32Array): number => a.reduce((s, x, i) => s + x * b[i], 0)

async function embedTexts(m: Pick<Models, 'tokenizer' | 'textModel'>, texts: string[]): Promise<Float32Array[]> {
  const inputs = m.tokenizer(texts, SIGLIP ? { padding: 'max_length', truncation: true, max_length: 64 } : { padding: true, truncation: true })
  const out = await m.textModel(inputs)
  const text_embeds = SIGLIP ? out.pooler_output : out.text_embeds
  const dim = text_embeds.dims[1]
  return texts.map((_, i) => normalize(Float32Array.from(text_embeds.data.slice(i * dim, (i + 1) * dim))))
}

const load = (): Promise<Models> =>
  (models ??= (async () => {
    const opts = {
      dtype: 'q8' as const,
      progress_callback: (p: { status: string; progress?: number }) => {
        if (p.status === 'progress' && p.progress !== undefined) self.postMessage({ type: 'progress', progress: p.progress })
      },
    }
    const [tokenizer, textModel, processor, visionModel] = await Promise.all([
      AutoTokenizer.from_pretrained(MODEL),
      (SIGLIP ? SiglipTextModel : CLIPTextModelWithProjection).from_pretrained(MODEL, opts),
      AutoProcessor.from_pretrained(MODEL),
      (SIGLIP ? SiglipVisionModel : CLIPVisionModelWithProjection).from_pretrained(MODEL, opts),
    ])
    const promptEmbeddings = await embedTexts({ tokenizer, textModel }, PROMPTS)
    return { tokenizer, textModel, processor, visionModel, promptEmbeddings }
  })().catch((e) => {
    models = null // allow a retry (e.g. offline the first time)
    throw e
  }))

type In = { kind: 'image'; id: string; blob: Blob } | { kind: 'text'; id: string; text: string }

self.onmessage = async (e: MessageEvent<In>) => {
  const msg = e.data
  try {
    const m = await load()
    if (msg.kind === 'text') {
      const [embedding] = await embedTexts(m, [msg.text])
      self.postMessage({ type: 'text', id: msg.id, embedding })
      return
    }
    const image = await RawImage.fromBlob(msg.blob)
    const out = await m.visionModel(await m.processor(image))
    const embedding = normalize(Float32Array.from((SIGLIP ? out.pooler_output : out.image_embeds).data))
    // Zero-shot type scores: softmax over cosine similarity to each type prompt.
    const logits = m.promptEmbeddings.map((p) => LOGIT_SCALE * dot(embedding, p))
    const max = Math.max(...logits)
    const exps = logits.map((l) => Math.exp(l - max))
    const sum = exps.reduce((s, x) => s + x, 0)
    const scores: Scored[] = PROMPTS.map((label, i) => ({ label, score: exps[i] / sum }))
    self.postMessage({ type: 'image', id: msg.id, embedding, scores })
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err instanceof Error ? err.message : String(err) })
  }
}
