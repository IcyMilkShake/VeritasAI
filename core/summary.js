import { parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-nano-2026-03-17'

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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `CLAIM: ${claim}\n\nSOURCES:\n${sourcesText}` },
      ],
    }),
  })

  const data = await response.json()
  const text = data.choices[0].message.content.trim()
  console.log("Summary:", text)
  return text
}