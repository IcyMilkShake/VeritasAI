// ─── Step 2: Analyze sources against a claim ─────────────────────────────────
// Input:  claim (string), sources [{ title, snippet, link, date, pageText }]
// Output: [{ result: { source, stance, confidence, summary }, date }]
import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-mini-2026-03-17'
console.log("1")
const ANALYZE_PROMPT = `You are a fact-checking engine. Current date/time: DATE

You analyze multiple news sources against a claim.
For each source, determine its stance relative to the claim.

Rules:
- Only use the given info
- Do not assume extra facts
- Do NOT add requirements to the claim that aren't there — judge the claim as literally written, nothing more
- Being conservative means use lower confidence when uncertain — it does NOT mean find reasons to contradict
- The source TITLE carries strong signal...
- Judge each source INDEPENDENTLY — do not let one source influence another
- Write each summary in 1-3 sentences — explain what the source says AND why it supports or contradicts the claim

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

STEP 1.5 — SOURCE DATE:
Each source includes its own date. Use it to assess the claim's status. If null, ignore entirely. Compare this source date to today's date provided.
- Recent source still says "proposed/planned" → stronger contradict — a recent article would
  confirm enactment if it had actually happened
- Old source confirming something → lower confidence, situation may have changed
- Source dated before the claimed event could have occurred → neutral or weak contradict

STEP 2 — ENTITY MATCHING:
Identify the exact subject of the claim (a specific person, company, country, law).
The source must be about that EXACT entity — not a relative, associate, predecessor, or
similarly named person.

- Claim about person X → source about X's father/child/colleague = neutral
- Claim about company X → source about X's subsidiary/competitor = neutral or weak
- Claim about country X → source about a different country = neutral

Examples:
- Claim: "Elon Musk touches kids" → source about Errol Musk (his father) = neutral
- Claim: "Apple banned app X" → source about Google banning app X = neutral
- Claim: "Joe Biden said Y" → source about Hunter Biden = neutral

A source is only relevant if it directly involves the SAME entity named in the claim.

STEP 3 — SCOPE MATCHING:
Pay attention to the statement clearly, does it require a full confirmation or only partial information is fine.
A source confirming only a narrow or partial is allowed when statement looks like this:
e.g. claim says "suspect is a teacher and a video games maker" → source says "suspect is a teacher" = support (0.1–0.3 confidence)
These claims do NOT NEED full claim confirmation

A source that needs full confirmation looks like this:
e.g. claim says "banned all AI" → source says "banned 8 types of AI" = contradict (0.4–0.7 confidence)
e.g. claim says "reversed all EV subsidies" → source says "removed one subsidy" = contradict (0.4–0.7 confidence)
These claims do NEED full claim confirmation

STEP 4 — NEARLY/ALMOST CLAIMS:
If the claim uses "nearly", "almost", or "attempted" — do not require the outcome to have
occurred. Evidence of a threat, security response, evacuation, or shots fired in proximity
IS supporting evidence.

CONFIDENCE RULES — use the full scale:
When in doubt, always choose LOWER confidence. Implication is not confirmation.

For SUPPORT:
- 1.0 → source explicitly confirms the claim's exact subject, action AND status, no ambiguity
- 0.8 → source strongly confirms but has minor caveats
- 0.6 → source confirms the general direction but status is incomplete
- 0.4 → source implies or suggests the claim may be true, or does not mention the exact subject by name
- 0.2 → source loosely relates, weak or indirect connection
- 0.1 → same topic/person but different time or event

For CONTRADICT:
- 1.0 → source explicitly and directly denies or disproves the claim's exact subject
- 0.8 → source strongly implies the claim is false
- 0.6 → source shows an earlier or incomplete stage, overstating reality
- 0.4 → source implies the claim may be wrong but does not directly address it
- 0.2 → source is tangentially contradicting, very indirect
- 0.1 → same topic/person but different time or event

For NEUTRAL:
- 0.0 → absolutely zero topical connection — use sparingly

Stance definitions:
- "support"    → source provides evidence, direct or indirect, that the claim may be true
- "contradict" → source provides evidence, direct or indirect, that the claim may be false
- "neutral"    → zero topical connection to the claim, or source is about a different entity

You will receive a claim and a numbered list of sources.
Return a JSON array with one object per source, in the same order.

Output ONLY a raw JSON array, no fences, no explanation:
[{"stance":"support|contradict|neutral","confidence":0.0,"summary":"..."},...]`


/*
trump gave a speech after suriving the shooting at white house correspondent dinner - support
thailand increased their VAT from 7 to 10% - false
thailand proposed an increase in their VAT from 7 to 10% - true
elon musk touches kids - contested or contradict
US and Israel started the Iran war - true
Iran started the US-Israel war - false
trump experienced an assassination attempt on april 25th - support or deny its fine but INCLUDE summary that the date is right
trump experienced an assassination attempt on april 28th - support or deny its fine but INCLUDE summary that the date is wrong
trump experienced a total of 2 assassination attempt so far - false
trump experienced atleast 2 assassination attempt so far - true
trump experienced an assassination attempt in 2026 - true
'Trump assassination attempts total latest confirmed reports'
'Trump assassination attempts latest confirmed reports'
'Trump assassination attempts total latest developments'

yo a note: test each prompt 2-3 times before moving to next one. test for the consistency 
then before a final commit. randomize the whole shit and then test it all again each once see if it wavers.


'Trump assassination attempt April 25 reported news'
'Trump assassination attempt April 25 latest news'

idea:
let AI reverdict itself around 3 times. then the result comes as the most verdict'ed but add this as a checkbox for "deeper analysis" explciitly saying it takes more time
*/

export async function analyzeSource(claim, sources) {
  const sourcesText = sources.map((s, i) => {
    const parts = [`[${i + 1}] DATE: ${s.date || 'null'}`]
    parts.push(`TITLE: ${s.title}`)
    parts.push(`SNIPPET: ${s.snippet}`)
    if (s.pageText) parts.push(`PAGE CONTENT: ${s.pageText}`)
    return parts.join('\n')
  }).join('\n\n')

  const now = new Date().toUTCString()
  const systemPrompt = ANALYZE_PROMPT.replace('DATE', now)

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
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: `CLAIM: ${claim}\n\nSOURCES:\n${sourcesText}` },
      ],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenAI proxy error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const raw = data.choices[0].message.content

  const results = parseJSON(raw)

  if (!Array.isArray(results)) throw new Error('Expected array from analyze')

  // zip results back with original source dates
  return results.map((r, i) => ({
    result: r,
    date: sources[i]?.date || null
  }))
}