import { parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-nano-2026-03-17'

const SYSTEM = `You are a fact-checking summarizer. Given a claim and a list of source analyses, 
write a SHORT MAX of 2-3 sentence plain English summary of what actually happened or what is true.

Rules:
- Write as if explaining the facts directly to someone — not as a review of what sources said
- Take condifence percentages, stances to consideration but NEVER mention confidence percentages or stances
- Ignore any source that contradicts the majority or makes a claim no other source supports — treat it as an outlier and exclude its details from the summary
- Only include details that are consistently supported across most sources
- Be concise and neutral in tone
- Write in plain English, no bullet points, no markdown
- You may also include other facts consistently found in each source to educate the user more if found
`


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