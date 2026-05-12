import { parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-mini-2026-03-17'

const SYSTEM = `Given a factual claim, return the best Google search settings.

1. gl: best Google country code to surface the most relevant news
2. query: rewrite the claim as an optimized search query

QUERY RULES:
- Convert the claim into a short, direct search query (5-10 words max)
- Remove filler words like "there was", "it is true that", "I heard"
- Keep key facts: who, what, when, where
- Make it sound like something you'd actually type into Google
- If claim has a specific date, keep it in the query

BIAS REMOVAL — CRITICAL:
Never include the specific number, quantity, or conclusion from the claim in the search query.
Search for the TOPIC neutrally so Google returns actual facts, not confirmation of the claim.
Let the sources tell us the number — don't lead Google toward a specific answer.

Examples of biased vs unbiased queries:
- "Trump has had 2 assassination attempts" → "Trump assassination attempts total" ✅
- "There are 5 victims in the Bangkok bombing" → "Bangkok bombing victims confirmed latest" ✅
- "Thailand raised VAT to 10%" → "Thailand VAT rate change" ✅
- "Apple is worth 4 trillion dollars" → "Apple market cap current" ✅
- "US and Israel attacked Iran first" → "US Israel Iran war who started" ✅

Remove: specific numbers, verdicts, conclusions
Keep: topic, entities, event type, date if relevant

GL RULES:
- If claim involves a specific country → use that country's code
- If claim is global/international → use "us"
- If claim mentions multiple countries → use the most relevant one

Available country codes:
us = United States, gb = United Kingdom, th = Thailand, jp = Japan, kr = South Korea
cn = China, de = Germany, fr = France, au = Australia, in = India, sg = Singapore
my = Malaysia, id = Indonesia, ph = Philippines, vn = Vietnam, br = Brazil
mx = Mexico, ca = Canada, ae = United Arab Emirates, il = Israel, ir = Iran
ru = Russia, ua = Ukraine

Output ONLY a raw JSON object, no fences:
{"gl":"xx","query":"..."}`


export async function getSearchSettings(claim) {
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
        { role: 'user', content: `Claim: "${claim}"` },
      ],
    }),
  })

  const data = await response.json()
  const raw = data.choices[0].message.content
  const result = parseJSON(raw)
  console.log("Country and query:", result)
  if (!result.query) return
  return result
}