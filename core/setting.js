import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'qwen3-vl:8b-instruct-q4_K_M'

const SYSTEM = `Given a factual claim, return the best Google country code (gl) to search it in.
Return the 2-letter country code that would surface the most relevant news sources.

Rules:
- If claim involves a specific country → use that country's code
- If claim is global/international → use "us"
- If claim mentions multiple countries → use the most relevant one

Examples:
- "Thailand raised VAT" → "th"
- "Trump banned TikTok" → "us"  
- "UK left the EU" → "gb"
- "Sony released PS6" → "us"
- "US and Israel attacked Iran" → "us"
- "Elon Musk bought Twitter" → "us"

Available country codes:
us = United States
gb = United Kingdom  
th = Thailand
jp = Japan
kr = South Korea
cn = China
de = Germany
fr = France
au = Australia
in = India
sg = Singapore
my = Malaysia
id = Indonesia
ph = Philippines
vn = Vietnam
br = Brazil
mx = Mexico
ca = Canada
ae = United Arab Emirates
il = Israel
ir = Iran
ru = Russia
ua = Ukraine

Output ONLY a raw JSON object, no fences:
{"gl":"xx"}`


export async function getSearchSettings(claim) {
  const raw = await callOllama(MODEL, [
    { role: 'system', content: SYSTEM },
    { role: 'user',   content: `Claim: "${claim}"` },
  ])
console.log("Country chosen:", parseJSON(raw))
  return parseJSON(raw)
}