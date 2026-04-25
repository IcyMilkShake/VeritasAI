// ─── Step 2: Analyze a source against a claim ────────────────────────────────
// Input:  claim (string), source { title, snippet, link }, pageText (string|null)
// Output: { source, stance, confidence, summary } or null if irrelevant
import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'gpt-5-nano-2025-08-07'

function buildSystem() {
  const now = new Date().toUTCString()
  return `You are a fact-checking engine. Current date/time: ${now}

You analyze a news source against a claim.
Determine the stance of the source relative to the claim.

You analyze a news source against a claim.
Determine the stance of the source relative to the claim.

Rules:
- Only use the given info
- Do not assume extra facts
- Be conservative
- The source TITLE carries strong signal — treat it as a headline summary of the article's conclusion
- A proposal, suggestion, or debate is NOT the same as something being enacted or completed;
  if the claim states something happened but the source only shows it was proposed, that is a contradiction
- SCOPE MATCHING: if the claim makes a broad/absolute statement, a source confirming only a
  narrow/partial version does NOT support it — it contradicts it
- RECENCY: if a source describes an earlier state that was later reversed or superseded,
  treat it as weak evidence — lower confidence accordingly (0.3–0.5)
  e.g. "TikTok goes dark" headline from Jan 19 is outdated if the app returned Jan 20

CONFIDENCE RULES — use the full scale, do not cluster around 0.9:
- 1.0 → source explicitly and directly confirms the claim, no ambiguity
- 0.8 → source strongly confirms but with minor caveats
- 0.6 → source confirms the general direction but scope or status is incomplete
- 0.4 → source is relevant but only weakly or indirectly supports/contradicts
- 0.2 → source is tangentially related, very loose connection
- 0.0 → source has zero relevance or is entirely off-topic

Stance definitions:
- "support"     → source CLEARLY supports or confirms the claim at the same scope and scale
- "contradict"  → source CLEARLY contradicts or denies the claim, or confirms only a narrow
                  subset of a broad claim
- "neutral"     → source does not meaningfully address the claim

Raise confidence if the source clearly and fully matches the claim
Reduce confidence if the source only partially matches the claim's scope

Output ONLY a JSON object, no fences, no explanation:
{"source":"...","stance":"support|contradict|neutral","confidence":0.0,"summary":"..."}`
}

export async function analyzeSource(claim, source, pageText = null) {
  const context = pageText
    ? `SOURCE TITLE: ${source.title}\nSOURCE SNIPPET: ${source.snippet}\nPAGE CONTENT: ${pageText}`
    : `SOURCE TITLE: ${source.title}\nSOURCE SNIPPET: ${source.snippet}`

  const user = `CLAIM: ${claim}\n\n${context}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: buildSystem() },
        { role: 'user',   content: user },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI proxy error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const raw = data.choices[0].message.content

  const result = parseJSON(raw)

  if (result.stance === 'neutral') return null

  return result
}