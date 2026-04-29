import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'qwen3-vl:8b-instruct-q4_K_M'

const SYSTEM = `You are a fact-checking summarizer. Given a claim and a list of source analyses, 
write a SHORT MAX of 2-3 sentence human-readable summary explaining what the sources collectively say.

Rules:
- Be concise and neutral in tone
- Mention what sources confirm, what they don't, and any key caveats
- Do not give a final verdict — just summarize the evidence
- Write in plain English, no bullet points, no markdown`

export async function summarizeAnalysis(claim, analyses) {
  const sourcesText = analyses.map((a, i) =>
    `[${i + 1}] ${a.stance.toUpperCase()} (${Math.round(a.confidence * 100)}%): ${a.summary}`
  ).join('\n')
  console.log(sourcesText)
  const raw = await callOllama(MODEL, [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `CLAIM: ${claim}\n\nSOURCES:\n${sourcesText}` },
  ])

  console.log("Summary:", raw)
  return raw
}