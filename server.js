import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { getJson } from 'serpapi'

import { extractClaims } from './core/claims.js'
import { analyzeSource } from './core/analyze.js'
import { computeVerdict } from './core/scoring.js'
import { fetchPageText } from './core/fetcher.js'
import { getSearchSettings } from './core/setting.js'
import { getDeeperSearchSettings } from './core/deepsetting.js'
import { summarizeAnalysis } from './core/summary.js'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = 8081
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ── Helpers ───────────────────────────────────────────────────────────────────

async function searchClaim(claim, timeSensitive = false, setting) {
  const gl = setting
    ? await getDeeperSearchSettings(claim.claim)
    : await getSearchSettings(claim.claim)
  if (setting) {
    console.log("deep search:", gl.query)
    return //not done bruh
  }
  const params = {
    engine: 'google',
    api_key: process.env.SERP_API_KEY,
    q: gl.query,
    hl: 'en',
    gl: gl.gl,
    num: 8,
    safe: 'off',
    ...(gl.news && { tbm: 'nws' }),
    no_cache: false, //yo set ts to true in production
  }

  console.log('[search] query:', params.q, '| gl:', gl.gl)
  if (timeSensitive) params.tbs = 'sbd:1'
 
  console.log('[search] query:', params.q, '| time_sensitive:', timeSensitive)
  const response = await getJson(params)
  const raw = gl.news ? response.news_results : response.organic_results
  console.log('[search] results count:', raw?.length ?? 0)
  if (response.error) console.error('[search] SerpAPI error:', response.error)
 
  return (raw || []).slice(0, 10).map(r => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    date: r.date || null
  }))
}

// ── POST /api/extract-claims ──────────────────────────────────────────────────
// Returns: { claims: [{ claim, time_sensitive }] }
app.post('/api/extract-claims', async (req, res) => {
  const { statement } = req.body
  if (!statement?.trim()) {
    return res.status(400).json({ error: 'Missing statement' })
  }

  try {
    const claims = await extractClaims(statement)
    res.json({ claims })
  } catch (err) {
    console.error('[extract-claims]', err.message)
    res.status(500).json({ error: 'Failed to extract claims', detail: err.message })
  }
})

// ── POST /api/search ──────────────────────────────────────────────────────────
// Body:    { claim: { claim, time_sensitive } }
// Returns: { results: [{ title, link, snippet }] }
app.post('/api/search', async (req, res) => {
  const { claim, setting } = req.body
  if (!claim) return res.status(400).json({ error: 'Missing claim' })

  try {
    const results = await searchClaim(claim, claim.time_sensitive, setting)
    if (!results) return res.status(200).json({ message: "No query" })
    res.json({ results })
  } catch (err) {
    console.error('[search]', err.message)
    res.status(500).json({ error: 'Search failed', detail: err.message })
  }
})

// ── POST /api/analyze-sources ─────────────────────────────────────────────────
// Body:    { claim, sources: [{ title, snippet, link, date }] }
// Returns: { results: [{ result, date }] }
app.post('/api/analyze-sources', async (req, res) => {
  const { claim, sources } = req.body
  if (!claim || !Array.isArray(sources)) return res.status(400).json({ error: 'Missing claim or sources' })

  try {
    // Fetch full page content for all sources in parallel, fall back to snippet-only if it fails
    const sourcesWithText = await Promise.all(
      sources.map(async (source) => {
        console.log(`  [fetch] ${source.link}`)
        const pageText = await fetchPageText(source.link).catch(() => null)
        return { ...source, pageText }
      })
    )

    const results = await analyzeSource(claim, sourcesWithText)
    res.json({ results })
  } catch (err) {
    console.error('[analyze-sources]', err.message)
    res.status(500).json({ error: 'Analysis failed', detail: err.message })
  }
})

app.post('/api/summary', async (req, res) => {
  const { claim, analyses } = req.body
  if (!claim || !Array.isArray(analyses)) 
    return res.status(400).json({ error: 'Missing claim or analyses' })

  try {
    const summary = await summarizeAnalysis(claim, analyses)
    res.json({ summary })
  } catch (err) {
    console.error('[summary]', err.message)
    res.status(500).json({ error: 'Summary failed', detail: err.message })
  }
})

// ── POST /api/verdict ─────────────────────────────────────────────────────────
app.post('/api/verdict', (req, res) => {
  const { analyses } = req.body
  if (!Array.isArray(analyses) || !analyses.length)
    return res.status(400).json({ error: 'Missing analyses array' })

  res.json(computeVerdict(analyses))
})

// ── GET /api/health ───────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`)
  console.log(`   Production URL will be: https://veritas.ipo-servers.net:${PORT}\n`)
})