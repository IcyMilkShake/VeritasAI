// ─── Extract claims/text from an image ───────────────────────────────────────
// Input:  base64 (string), mimeType (string e.g. 'image/png')
// Output: extracted statement string
import { parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-mini-2026-03-17'

const SYSTEM = `You are a claim extraction assistant. The user has uploaded a screenshot they want fact-checked.

Your job is to extract the factual statement or claim visible in the image.

Rules:
- Extract only the core factual content — the statement, headline, or claim the user likely wants verified
- Remove usernames, timestamps, UI elements, watermarks, and platform chrome (likes, retweets, etc.)
- If there are multiple claims, combine them into one coherent statement
- Do not verify, judge, or comment on the claim — just extract it cleanly
- Write in plain English as if the user typed it themselves
- If the image contains no verifiable factual claim (e.g. it's a meme, photo, or unrelated image), return null

Output ONLY a raw JSON object, no fences:
{"text":"..."} or {"text":null}`


export async function extractFromImage(base64, mimeType) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high'
              }
            },
            {
              type: 'text',
              text: 'Extract the factual claim or statement from this screenshot.'
            }
          ]
        }
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const raw = data.choices[0].message.content
  const result = parseJSON(raw)
  console.log('[image-extract] result:', result)
  return result.text || null
}