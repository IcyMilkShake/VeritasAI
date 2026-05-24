// ─── Pipeline note ───
// 1. 3 queries → 15 results → analyze → draft verdict
// 2. find gap and unsure info → generate up to 3 follow-up queries
// 3. follow-up searches → analyze with context
// 4. final verdict + summary
import { parseJSON } from './ollama.js'
import { getJson } from 'serpapi'
import { fetchPageText } from './fetcher.js'
import { analyzeSource } from './analyze.js'
import { computeVerdict } from './scoring.js'
import { summarizeAnalysis } from './summary.js'
import { getDeeperSearchSettings } from './deepsetting.js'

const MODEL = 'gpt-5.4-mini-2026-03-17'

const GAP_PROMPT = `You are a fact-checking assistant reviewing a draft verdict on a claim.

Given the claim, the sources found so far, and a draft verdict — identify:
1. What key facts are still missing or unverified that would change or strengthen the verdict
2. Any additional context that would help the user understand the full picture
3. Up to 3 follow-up search queries to fill those gaps (or fewer if not needed)

RULES:
- Only generate follow-up queries if there are genuine gaps — do not search for the sake of it
- If the draft verdict is already well-supported with no ambiguity, return empty queries array
- Queries follow the same bias removal rules — no specific numbers or conclusions
- Each query 5-10 words max
- Only include a date if the claim explicitly mentions one

Output ONLY a raw JSON object, no fences:
{"gaps":"brief description of what is missing or null if nothing","queries":["...","..."]}`


// ── Helper: run a single google search ───────────────────────────────────────
async function runSearch(query, gl, numResults = 5) {
  const params = {
    engine: 'google',
    api_key: process.env.SERP_API_KEY,
    q: query,
    hl: 'en',
    gl: gl,
    num: numResults,
    safe: 'off',
    no_cache: false,
  }
  console.log('[deep-search] query:', query, '| gl:', gl)
  const response = await getJson(params)
  if (response.error) console.error('[deep-search] SerpAPI error:', response.error)
  return (response.organic_results || []).slice(0, numResults).map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    date: r.date || null
  }))
}

// ── Helper: fetch page text for all sources in parallel ───────────────────────
async function fetchAll(sources) {
  return Promise.all(
    sources.map(async (source) => {
      console.log(`  [fetch] ${source.link}`)
      const pageText = await fetchPageText(source.link).catch(() => null)
      return { ...source, pageText }
    })
  )
}

// ── Main deep analyze pipeline ────────────────────────────────────────────────
export async function deepAnalyze(claim) {

  // ── Phase 1: 3 queries → search + analyze ──────────────────────────────────
  console.log('[deep] Phase 1: getting search settings')
  const settings = await getDeeperSearchSettings(claim)
  if (!settings?.query?.length) throw new Error('Failed to get deep search settings')

  // run all 3 searches in parallel
  const phase1Results = await Promise.all(
    settings.query.map(q => runSearch(q, settings.gl, 5))
  )

  // flatten + deduplicate by link
  const seen = new Set()
  const phase1Sources = phase1Results.flat().filter(s => {
    if (seen.has(s.link)) return false
    seen.add(s.link)
    return true
  })
  console.log(`[deep] Phase 1: ${phase1Sources.length} unique sources after dedup`)

  // fetch page text + analyze
  const phase1WithText = await fetchAll(phase1Sources)
  const phase1Analyses = await analyzeSource(claim, phase1WithText)

  // attach titles + filter neutral for verdict
  const phase1Valid = phase1Analyses
    .map((a, i) => ({ ...a, result: { ...a.result, source: phase1Sources[i].title } }))
    .filter(a => a.result.stance !== 'neutral')

  // draft verdict from phase 1
  const draftVerdict = computeVerdict(phase1Valid.map(a => a.result))
  console.log('[deep] Phase 1 draft verdict:', draftVerdict.verdict)

  // ── Phase 2: gap analysis ───────────────────────────────────────────────────
  console.log('[deep] Phase 2: gap analysis')
  const summaryText = phase1Valid.map((a, i) =>
    `[${i + 1}] ${a.result.stance.toUpperCase()} (${Math.round(a.result.confidence * 100)}%): ${a.result.summary}`
  ).join('\n')

  const gapResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: GAP_PROMPT },
        { role: 'user', content: `CLAIM: ${claim}\n\nDRAFT VERDICT: ${draftVerdict.verdict}\n\nSOURCES FOUND:\n${summaryText}` },
      ],
    }),
  })

  const gapData = await gapResponse.json()
  const gapResult = parseJSON(gapData.choices[0].message.content)
  console.log('[deep] gaps:', gapResult.gaps)
  console.log('[deep] follow-up queries:', gapResult.queries)

  // ── Phase 3: follow-up searches ─────────────────────────────────────────────
  let phase2Valid = []

  if (gapResult.queries?.length) {
    console.log('[deep] Phase 3: running follow-up searches')

    // cap at 3 follow-up queries
    const followUpQueries = gapResult.queries.slice(0, 3)

    const phase2Results = await Promise.all(
      followUpQueries.map(q => runSearch(q, settings.gl, 5))
    )

    // flatten + deduplicate against phase 1 and within phase 2
    const phase2Sources = phase2Results.flat().filter(s => {
      if (seen.has(s.link)) return false
      seen.add(s.link)
      return true
    })
    console.log(`[deep] Phase 3: ${phase2Sources.length} new unique sources`)

    if (phase2Sources.length) {
      // pass phase 1 summary as context so analyze knows what we already found
      const phase2WithText = await fetchAll(phase2Sources)
      const phase2Analyses = await analyzeSource(claim, phase2WithText)

      phase2Valid = phase2Analyses
        .map((a, i) => ({ ...a, result: { ...a.result, source: phase2Sources[i].title } }))
        .filter(a => a.result.stance !== 'neutral')
    }
  }

  // ── Phase 4: final verdict + summary ────────────────────────────────────────
  console.log('[deep] Phase 4: final verdict')
  const allValid = [...phase1Valid, ...phase2Valid]
  const finalVerdict = computeVerdict(allValid.map(a => a.result))
  const finalSummary = await summarizeAnalysis(claim, allValid.map(a => a.result))

  return {
    sources: {
      phase1: phase1Valid,
      phase2: phase2Valid,
    },
    gaps: gapResult.gaps || null,
    draftVerdict,
    finalVerdict,
    finalSummary,
  }
}