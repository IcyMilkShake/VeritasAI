// ─── Step 2: Analyze a source against a claim ────────────────────────────────
// Input:  claim (string), source { title, snippet, link }, pageText (string|null)
// Output: { source, stance, confidence, summary } or null if irrelevant
import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-nano-2026-03-17'

function buildSystem() {
  const now = new Date().toUTCString()
  return `You are a fact-checking engine. Current date/time: ${now}

You analyze a news source against a claim.
Determine the stance of the source relative to the claim.

Rules:
- Only use the given info
- Do not assume extra facts
- Be conservative
- The source TITLE carries strong signal — treat it as a headline summary of the article's conclusion

STEP 1 — READ THE CLAIM'S TENSE FIRST:
Before doing anything else, identify what the claim is asserting:

- Past tense ("raised", "banned", "signed", "passed", "increased") → claim asserts it ALREADY HAPPENED COMPLETELY
  Sources showing only proposal/plan/debate = contradict (0.6–0.8)
  Sources showing it was attempted but reversed = contradict (0.8–1.0)
  Sources showing it never happened = contradict (0.9–1.0)

- Present tense ("is", "has been", "remains") → claim asserts it is CURRENTLY TRUE
  Sources showing it was true before but no longer = contradict (0.8)
  Sources showing it is only partially true = contradict (0.5–0.6)

- Intent/future tense ("planning to", "considering", "wants to", "will") → claim asserts INTENT ONLY
  Sources showing proposals or discussions = support (0.7–0.9)
  Sources showing it was never enacted = neutral or weak contradict (0.1–0.2)

Examples:
- "Thailand RAISED VAT to 10%" → past tense → must have already happened
  source says "proposed to raise" = contradict (0.7)
  source says "VAT remains at 7%" = contradict (1.0)
- "Thailand PLANS TO raise VAT" → intent → proposal is enough
  source says "senate proposed VAT hike" = support (0.8)

STEP 2 — SCOPE MATCHING:
Pay attention to the statement clearly, does it require a full confirmation or only partial information is fine. 
A source confirming only a narrow or partial is allowed when statement looks like this:
e.g. claim says "suspect is a teacher and a video games maker" → source says "suspect is a teacher" = support (0.1-0.3 confidence)
These claims do NOT NEED full claim confirmation

A source that needs full confirmation looks like this:
e.g. claim says "banned all AI" → source says "banned 8 types of AI" = contradict (0.4-0.7 confidence)
e.g. claim says "reversed all EV subsidies" → source says "removed one subsidy" = contradict (0.4-0.7 confidence)
These claims do NEED full claim confirmation

STEP 3 — NEARLY/ALMOST CLAIMS:
If the claim uses "nearly", "almost", or "attempted" — do not require the outcome to have
occurred. Evidence of a threat, security response, evacuation, or shots fired in proximity
IS supporting evidence.

CONFIDENCE RULES — use the full scale:
For SUPPORT:
- 1.0 → source explicitly confirms the claim's action AND status, no ambiguity
- 0.8 → source strongly confirms but has minor caveats
- 0.6 → source confirms the general direction but scope or status is incomplete
- 0.4 → source is suggestive but key details are missing
- 0.2 → source loosely relates, weak connection
- 0.1 → same topic/person but different time or event

For CONTRADICT:
- 1.0 → source explicitly and directly denies or disproves the claim
- 0.8 → source strongly implies the claim is false
- 0.6 → source shows an earlier or incomplete stage, overstating reality
- 0.4 → source hints the claim may be wrong but indirectly
- 0.2 → source is tangentially contradicting
- 0.1 → same topic/person but different time or event

For NEUTRAL:
- 0.0 → absolutely zero topical connection — use sparingly

Stance definitions:
- "support"    → source provides evidence, direct or indirect, that the claim may be true
- "contradict" → source provides evidence, direct or indirect, that the claim may be false
- "neutral"    → zero topical connection to the claim

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

//if (result.stance === 'neutral') return null

  return result
}