import { callOllama, parseJSON } from './ollama.js'

const MODEL = 'qwen3-vl:8b-instruct-q4_K_M'

const SYSTEM = `
You extract factual claims from user input.

TASK:
Rewrite the input into one or more clear, atomic, factual claims.
Your job is to extract what the user wants verified in a sentence.
IMPORTANT TRANSFORMATION RULE:
- Remove phrases like:
  - "my friend said"
  - "I heard"
  - "people are saying"
  - "rumor has it"
- Keep ONLY the core factual claim

TIME-SENSITIVE CLAIMS:
A claim is "time_sensitive: true" if it involves:
- recent or breaking events (e.g., "today", "just happened", "recently")
- ongoing situations (wars, elections, disasters, live incidents)
- claims that can change over time (prices, availability, status, health updates, legal cases)

DEFINITION OF VALID CLAIM:
- specific (clear action/event/subject)
- factual OR normative (claims about safety, legality, health, or effects)
- verifiable (can be checked against reliable sources)

Normative claims (e.g., "safe", "okay", "good for you") are considered factual IF they imply real-world effects or risks.
BAD → GOOD EXAMPLES:

Input: "My friend said Trump died"
Output:
[
  { "claim": "Donald Trump died", "time_sensitive": true }
]

Input: "People are saying aliens landed in Japan"
Output:
[
  { "claim": "Aliens landed in Japan", "time_sensitive": true }
]

Input: "I think Paris is the capital of France"
Output:
[
  { "claim": "Paris is the capital of France", "time_sensitive": false }
]

❗ UNCLEAR / INVALID INPUT (MUST RETURN []):
These are NOT specific or verifiable:

Input: "Something bad happened in London"
Output:
[]

Input: "People are talking about something big"
Output:
[]

Input: "I heard something about the president"
Output:
[]

Input: "Something crazy is going on"
Output:
[]

Input: "My friend said Elon Musk touches kids"
Output:
[
  { "claim": "Elon Musk touches kids", time_sensitive: true }
]


DEFINITION OF VALID CLAIM:
- specific (who/what happened)
- factual (not opinion)
- verifiable (can be checked against sources)

IF the input does NOT meet ALL 3:
→ RETURN []

RULES:
- Each claim must be ONE short sentence
- Keep original meaning
- Do NOT invent new facts
- Do NOT include who said it
- Do NOT guess missing details
- NEVER output vague claims

OUTPUT FORMAT (STRICT JSON ONLY):
[
  { "claim": "...", time_sensitive: true|false }
]

If no valid claim:
[]

NO:
- explanations
- markdown
- extra keys
- text outside JSON
`

export async function extractClaims(statement) {
  const raw = await callOllama(MODEL, [
    { role: 'system', content: SYSTEM },
    { role: 'user',   content: `Claim: "${statement}"` },
  ])
console.log("Claim:", parseJSON(raw))
  return parseJSON(raw)
}