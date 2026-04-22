import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

import { extractClaims } from './core/claims.js'
import { analyzeSource } from './core/analyze.js'
import { computeVerdict } from './core/scoring.js'
import { getJson } from "serpapi";
import fetch from 'node-fetch'

const app = express()
const PORT = 3000
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// ── POST /api/extract-claims ──────────────────────────────────────────────────
app.post('/api/extract-claims', async (req, res) => {
  const { statement } = req.body
  if (!statement?.trim()) {
    return res.status(400).json({ error: 'Missing statement' })
  }

  try {
    const claims = await extractClaims(statement)

    if (!claims.length) {
      return res.json({ claims: [], searchResults: [] })
    }

    const query = claims[0].claim + " news"
    //make it so it works for more than 1 claims too
    const response = await getJson({
      engine: "google",
      api_key: "b4e517e9f932f23d6a31a1e7bf0b80b8ece775fe79d9b2b5c3c17947cf88aae5",
      q: query,
      location: "Austin, Texas",
    })
    const cleanedResults = (response.organic_results || []).map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet
    }))
    res.json({
      claims,
      searchResults: cleanedResults
    })

  } catch (err) {
    console.error('[extract-claims]', err.message)
    res.status(500).json({
      error: 'Failed to extract claims',
      detail: err.message
    })
  }
})
// ── POST /api/analyze-source ──────────────────────────────────────────────────
app.post('/api/analyze-source', async (req, res) => {
  const { claim, source } = req.body
  if (!claim || !source) return res.status(400).json({ error: 'Missing claim or source' })
  try {
    const analysis = await analyzeSource(claim, source)
    async function getHTML(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    })
    const html = await res.text()
    return html
  } catch (err) {
    console.error('Failed to fetch:', url)
    return null
  }
}
    res.json(analysis)
  } catch (err) {
    console.error('[analyze-source]', err.message)
    res.status(500).json({ error: 'Analysis failed', detail: err.message })
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
  console.log(`\n  ▸ http://localhost:${PORT}\n`)
})