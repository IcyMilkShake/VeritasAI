// ─── Step 2: Analyze a source against a claim ────────────────────────────────
// Input:  claim (string), source { title, snippet, url }
// Output: { source, stance, confidence, summary }

import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'qwen3-vl:8b-instruct'

const SYSTEM = `You analyze a news source against a claim.
Determine the stance of the source relative to the claim.
Rules: only use the given info, do not assume extra facts, be conservative.
Output ONLY a JSON object with this exact shape (no fences):
{"source":"...","stance":"support|contradict|neutral","confidence":0.0,"summary":"..."}`

export async function analyzeSource(claim, source) {
  const user = `CLAIM: ${claim}
SOURCE TITLE: ${source.title}
SOURCE SNIPPET: ${source.snippet}`

  const raw = await callOllama(MODEL, [
    { role: 'system', content: SYSTEM },
    { role: 'user',   content: user },
  ])

  return parseJSON(raw)
}