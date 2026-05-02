// ─── Step 2: Analyze a source against a claim ────────────────────────────────
// Input:  claim (string), source { title, snippet, link }, pageText (string|null)
// Output: { source, stance, confidence, summary } or null if irrelevant
import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-mini-2026-03-17'

const ANALYZE_PROMPT = `You are a fact-checking engine.

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

STEP 2 — DATE CHECK:
Current date/time: DATE

If the claim states a specific date or relative time ("yesterday", "X days ago"):
- Look for the date the described EVENT OCCURRED inside the source content
- The event date is usually found in phrases like:
  "on [date]", "occurred on", "happened on", "took place on", 
  "on [weekday]", "last [weekday]", "[month] [day]"
- IGNORE dates in these contexts:
  "published", "updated", "last modified", "posted", "copyright", "retrieved"
  These are article metadata, not event dates

- Event date MATCHES claim date → support (0.8–1.0)
- Event date DOES NOT MATCH → contradict (0.6–0.8)
- No event date found → support capped at 0.5, never higher
  Note in summary: "event date not found in source"

NEVER use article publish/update dates. Only dates describing when the event itself occurred.

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
- If claim has a specific date and source has NO event date → cap at 0.5 (per STEP 2)

For CONTRADICT:
- 1.0 → explicitly denies the core claim
- 0.8 → strongly implies the claim is false
- 0.6 and below → only use if the source clearly contradicts key parts
- If claim has a specific date and source event date MISMATCHES → minimum 0.6 (per STEP 2)

For NEUTRAL:
- Use ONLY when the source has zero meaningful connection to the claim
- A source confirming the event but missing the date is NOT neutral — it is support at low confidence
- A source about a different entity or completely unrelated event = neutral

Stance definitions:
- "support"    → source confirms the core claim is likely true; confidence is shaped by STEP 2 date check
- "contradict" → source indicates the core claim is likely false OR the specific date is wrong (STEP 2)
- "neutral"    → zero topical or entity connection to the claim — not just missing details

Output ONLY a JSON object, no fences, no explanation:
{"source":"...","stance":"support|contradict|neutral","confidence":0.0,"summary":"..."}`

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
*/
export async function analyzeSource(claim, source, pageText = null, previousAnalyses = []) {
  console.log("tis the new version")
  const context = pageText
    ? `SOURCE TITLE: ${source.title}\nSOURCE SNIPPET: ${source.snippet}\nPAGE CONTENT: ${pageText}`
    : `SOURCE TITLE: ${source.title}\nSOURCE SNIPPET: ${source.snippet}`

  const historyText = previousAnalyses.length
    ? `\nPREVIOUS SOURCE ANALYSES (for context only — judge this source independently):\n${
        previousAnalyses.map((a, i) =>
          `[${i+1}] ${a.stance.toUpperCase()} (${Math.round(a.confidence * 100)}%): ${a.summary}`
        ).join('\n')
      }\n`
    : ''

  const user = `CLAIM: ${claim}\n${historyText}\n${context}`

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