import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { getJson } from 'serpapi'

import { extractClaims } from './core/claims.js'
import { analyzeSource } from './core/analyze.js'
import { computeVerdict } from './core/scoring.js'
import { fetchPageText } from './core/fetcher.js'
import { getSearchSettings } from './core/setting.js'
import { summarizeAnalysis } from './core/summary.js'
import dotenv from 'dotenv'

dotenv.config()

// ←←← Existing logs
console.log("✅ Server file loaded");
console.log("Current directory:", path.dirname(fileURLToPath(import.meta.url)));
console.log("SERP_API_KEY loaded?", !!process.env.SERP_API_KEY ? "YES" : "NO");

const app = express()
const PORT = 8081
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')));

console.log("✅ Express app created successfully");   // ← Add this line

// ── Helpers ───────────────────────────────────────────────────────────────────

console.log("✅ Starting to load helper functions...");   // ← Add this line

async function searchClaim(claim, timeSensitive = false) {
  const gl = await getSearchSettings(claim.claim)
  const params = {
    engine: 'google',
    api_key: process.env.SERP_API_KEY,
    q: claim.claim + ' news',
    hl: 'en',
    gl: gl.gl,
    num: 8,
    safe: 'off',
    no_cache: false, //yo set ts to true in production
  }

  console.log('[search] query:', params.q, '| gl:', gl.gl)
//if (timeSensitive) params.tbs = 'sbd:1'
 
  console.log('[search] query:', params.q, '| time_sensitive:', timeSensitive)
  const response = await getJson(params)
  console.log('[search] results count:', response.organic_results?.length ?? 0)
  if (response.error) console.error('[search] SerpAPI error:', response.error)
 
  return (response.organic_results || []).map(r => ({
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
  const { claim } = req.body
  if (!claim) return res.status(400).json({ error: 'Missing claim' })

  try {
    const results = await searchClaim(claim, claim.time_sensitive)
    res.json({ results })
  } catch (err) {
    console.error('[search]', err.message)
    res.status(500).json({ error: 'Search failed', detail: err.message })
  }
})

app.post('/api/analyze-source', async (req, res) => {
  const { claim, source } = req.body
  if (!claim || !source) return res.status(400).json({ error: 'Missing claim or source' })

  try {
    // Fetch full page content, fall back to snippet-only if it fails
    console.log(`  [fetch] ${source.link}`)
    const pageText = await fetchPageText(source.link)
    const analysis = await analyzeSource(claim, source, pageText)

    // analyzeSource returns null for neutral — tell frontend to skip it
    if (!analysis) return res.json({ filtered: true })

    res.json(analysis)
  } catch (err) {
    console.error('[analyze-source]', err.message)
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})