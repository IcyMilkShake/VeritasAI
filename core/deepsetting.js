import { parseJSON } from './ollama.js'

const MODEL = 'gpt-5.4-mini-2026-03-17'

const SYSTEM = `Given a factual claim, return optimized Google search settings for 3 different queries that triangulate the truth from multiple angles.

1. gl: best Google country code to surface the most relevant news
2. query: array of 3 search queries approaching the claim from different angles:
   - Query 1: direct fact verification (what is the actual current value/status)
   - Query 2: find the specific event or announcement that would confirm/deny the claim
   - Query 3: broader context — policy, background, or related coverage that adds nuance
3. news: true if the claim is a verifiable factual/news claim, false if it is subjective, opinion-based, or a general knowledge fact unlikely to appear in news articles.

NEWS FIELD RULES:
- true: recent events, statistics, political claims, accidents, crimes, economic data, scientific findings
- false: opinions ("cats are cute"), superlatives without context ("iPhones are the most expensive"), common knowledge, taste/preference claims
- When in doubt, lean false — only mark true if a news article would plausibly exist confirming or denying it

QUERY RULES:
- Each query should be 5-10 words max
- Remove filler words like "there was", "it is true that", "I heard"
- Keep key facts: who, what, when, where
- Make each query sound like something you'd actually type into Google
- Only include a specific date or year if the claim itself explicitly mentions one
- Query 3: if the claim contains a specific date or year, use it as a date-anchored
  query: "[entity] [event] [date]". If no date, use broader context instead.

BIAS REMOVAL — CRITICAL:
Never include the specific number, quantity, or conclusion from the claim in any query.
Search for the TOPIC neutrally so Google returns actual facts, not confirmation of the claim.
Let the sources tell us the number — don't lead Google toward a specific answer.

Examples:
Claim: "Trump experienced an assassination attempt in 2026"
{"gl":"us","query":["Trump assassination attempt latest","Trump shooting incident news","Trump security threat 2026"],"news":true}

Claim: "Thailand raised VAT to 10% in March"
{"gl":"th","query":["Thailand VAT rate current","Thailand VAT increase announcement","Thailand VAT change March"],"news":true}

Claim: "Trump has had 2 assassination attempts"
{"gl":"us","query":["Trump assassination attempts total","Trump security incident latest news","Trump secret service threat history"],"news":true}

Claim: "Apple is worth 4 trillion dollars"
{"gl":"us","query":["Apple market cap current","Apple valuation milestone news","Apple stock price history record"],"news":true}

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
{"gl":"xx","query":["...","...","..."],"news":true||false}`


export async function getDeeperSearchSettings(claim) {
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
  console.log("Deeper search settings:", result)
  if (!result.query?.length) return
  return result
}