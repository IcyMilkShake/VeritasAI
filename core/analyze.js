// ─── Step 2: Analyze a source against a claim ────────────────────────────────
// Input:  claim (string), source { title, snippet, link }, pageText (string|null)
// Output: { source, stance, confidence, summary } or null if irrelevant
import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-mini-2026-03-17'

const ANALYZE_PROMPT = `You are a fact-checking engine. Current date/time: DATE

You analyze a news source against a claim.
Determine the stance of the source relative to the claim.

Rules:
- Only use the given info
- Do not assume extra facts
- Be conservative but reasonable
- The source TITLE carries strong signal — treat it as a headline summary of the article's conclusion

STEP 1 — READ THE CLAIM'S TENSE FIRST:
Before doing anything else, identify what the claim is asserting:

- Past tense ("raised", "banned", "signed", "passed", "increased", "gave a speech", "spoke") → claim asserts the event happened
  Sources showing only proposal/plan = weak contradict or neutral
  Sources showing it was attempted but reversed = contradict
  Sources showing the core event occurred (even with slight differences in timing or wording) = support

- Present tense ("is", "has been", "remains") → claim asserts it is currently true
- Intent/future tense ("planning to", "considering", "wants to", "will") → proposal or discussion is usually enough for support

STEP 2 — RECENCY CHECK:
Current date is provided at the top. Use it to assess whether sources match the claim's timeframe.
Slight differences in timing (same day or next day) should not automatically make a source neutral.

STEP 3 — ENTITY MATCHING:
The source must be about the same main entity named in the claim.
Minor differences (e.g. father vs son) = neutral.

STEP 4 — SCOPE MATCHING:
- If the claim is relatively broad ("gave a speech after surviving a shooting"), sources that confirm the main event happened and that Trump spoke afterward should be treated as SUPPORT, even if wording is not 100% exact.
- Only strong contradictions (e.g. source says the event never happened or Trump did not speak at all) should be labeled CONTRADICT.

STEP 5 — NEARLY/ALMOST CLAIMS:
If the claim uses "after surviving", evidence that shots were fired and Trump later spoke / held a press conference / made a statement counts as supporting evidence.

CONFIDENCE RULES:
When in doubt, choose slightly lower confidence, but do not overly punish reasonable supporting sources.
Real news reporting often uses slightly different wording — do not demand perfect match.

For SUPPORT:
- 1.0 → perfect explicit confirmation with no ambiguity
- 0.8 → strongly supports the core claim
- 0.6 → supports the general direction or main event (recommended default for reasonable matches)
- 0.4 and below → weak or indirect support

For CONTRADICT:
- 1.0 → explicitly denies the core claim
- 0.8 → strongly implies the claim is false
- 0.6 and below → only use if the source clearly contradicts key parts

For NEUTRAL:
- Use when the source has no meaningful connection to the claim or is about a clearly different event/entity.

Stance definitions:
- "support"    → source provides evidence that the core claim is likely true
- "contradict" → source provides evidence that the core claim is likely false
- "neutral"    → little or no relevant connection to the claim

Output ONLY a JSON object, no fences, no explanation:
{"source":"...","stance":"support|contradict|neutral","confidence":0.0,"summary":"..."}`

/*
trump gave a speech after suriving the shooting at white house correspondent dinner - support
thailand increased their VAT from 7 to 10% - false
thailand proposed an increase in their VAT from 7 to 10% - true
elon musk touches kids - contested or contradict
US and Israel started the Iran war - true
Iran started the US-Israel war - false
*/
export async function analyzeSource(claim, source, pageText = null) {
  const context = pageText
    ? `SOURCE TITLE: ${source.title}\nSOURCE SNIPPET: ${source.snippet}\nPAGE CONTENT: ${pageText}`
    : `SOURCE TITLE: ${source.title}\nSOURCE SNIPPET: ${source.snippet}`

  const user = `CLAIM: ${claim}\n\n${context}`

  const now = new Date().toUTCString()
  const articleDate = source.date
  console.log(articleDate)
  const systemPrompt = ANALYZE_PROMPT.replace('DATE',now)
  console.log('[pageText preview]', pageText?.slice(0, 500))
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
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

  return { result, date: source.date || null }
}