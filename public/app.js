const API = "/api";

const statementEl = document.getElementById("statement");
const charCountEl = document.getElementById("char-count");
const analyzeBtn  = document.getElementById("analyze-btn");
const resetBtn    = document.getElementById("reset-btn");
const statusEl    = document.getElementById("status");
const statusText  = document.getElementById("status-text");
const resultsEl   = document.getElementById("results");

window.OPTIONS = {
  forceUserClaim: false,
  deeperSearch:   false,
}

const toggleBtn  = document.getElementById('options-toggle')
const panel      = document.getElementById('options-panel')

toggleBtn.addEventListener('click', () => {
  const open = panel.classList.toggle('open')
  toggleBtn.classList.toggle('open', open)
})

document.getElementById('opt-force-claim').addEventListener('change', e => {
  window.OPTIONS.forceUserClaim = e.target.checked
  console.log('[options] forceUserClaim:', window.OPTIONS.forceUserClaim)
})

document.getElementById('opt-deeper-search').addEventListener('change', e => {
  window.OPTIONS.deeperSearch = e.target.checked
  console.log('[options] deeperSearch:', window.OPTIONS.deeperSearch)
})

// ── Char counter ──────────────────────────────────────────────────────────────
statementEl.addEventListener("input", () => {
  const len = statementEl.value.length;
  charCountEl.textContent = `${len}/500`;
  charCountEl.classList.toggle("warn", len > 450);
  analyzeBtn.disabled = len === 0;
});

// ── Buttons ───────────────────────────────────────────────────────────────────
analyzeBtn.addEventListener("click", onAnalyze);
resetBtn.addEventListener("click", onReset);

function onReset() {
  statementEl.value = "";
  charCountEl.textContent = "0/500";
  analyzeBtn.disabled = true;
  resetBtn.classList.add("hidden");
  resultsEl.innerHTML = "";
  setStatus(null);
}

function setStatus(text) {
  if (!text) { statusEl.classList.add("hidden"); return; }
  statusEl.classList.remove("hidden");
  statusText.textContent = text;
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

function createClaimBlock(claim, idx) {
  const block = document.createElement('div')
  block.className = 'claim-block'
  block.id = `claim-${idx}`
  block.innerHTML = `
    <div class="claim-header">
      <span class="claim-id">CLAIM_${String(idx + 1).padStart(2, '0')}</span>
      <span class="claim-text">${escapeHtml(claim.claim)}</span>
      ${claim.time_sensitive ? '<span class="badge-time">⚡ LIVE</span>' : ''}
      <span class="verdict-badge hidden" id="verdict-${idx}"></span>
    </div>
    <div class="claim-body" id="body-${idx}"></div>
  `
  resultsEl.appendChild(block)
  return block
}

function appendSourceCard(idx, analysis, date) {
  const body = document.getElementById(`body-${idx}`)
  const stanceMeta = {
    support:    { label: 'SUPPORTS',    cls: 'support' },
    contradict: { label: 'CONTRADICTS', cls: 'contradict' },
  }
  const m = stanceMeta[analysis.stance] ?? { label: analysis.stance.toUpperCase(), cls: 'neutral' }
  const pct = Math.round((analysis.confidence ?? 0.5) * 100)
  const dateStr = date ? `<span class="source-date">${escapeHtml(date)}</span>` : ''

  const card = document.createElement('div')
  card.className = `source-card ${m.cls}`
  card.innerHTML = `
    <div class="source-top">
      <span class="source-title">${escapeHtml(analysis.source)}</span>
      <span class="stance-badge ${m.cls}">${m.label}</span>
    </div>
    ${dateStr}
    <p class="source-summary">${escapeHtml(analysis.summary)}</p>
    <div class="confidence-bar">
      <div class="confidence-fill" style="width:${pct}%"></div>
      <span class="confidence-pct">${pct}%</span>
    </div>
  `
  body.appendChild(card)
}

function setVerdictBadge(idx, verdict) {
  const badge = document.getElementById(`verdict-${idx}`)
  badge.textContent = verdict.verdict
  badge.style.color = verdict.color
  badge.style.borderColor = verdict.color + '55'
  badge.classList.remove('hidden')
}

function showNoSources(idx) {
  const body = document.getElementById(`body-${idx}`)
  body.innerHTML = '<p class="no-sources">No relevant sources found.</p>'
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function setSummary(idx, text) {
  const header = document.querySelector(`#claim-${idx} .claim-header`)
  const el = document.createElement('div')
  el.className = 'claim-summary'
  el.textContent = text
  header.insertAdjacentElement('afterend', el)
}

async function onAnalyze() {
    const statement = statementEl.value.trim();
    if (!statement) return;
    console.log("Analyzing starts")
    analyzeBtn.disabled = true;
    resetBtn.classList.remove("hidden");
    resultsEl.innerHTML = "";
    setStatus("Extracting claims...");

  let claims
  if (!window.OPTIONS.forceUserClaim) {
    try {
      const claimData = await apiPost('/extract-claims', { statement })
      claims = claimData.claims
    } catch (err) {
      setStatus(`Error: ${err.message}`)
      analyzeBtn.disabled = false
      return
    }
  } else {
    claims = [{ "claim": statement, "time_sensitive": false }]
  }

  if (!claims.length) {
    setStatus(null)
    resultsEl.innerHTML = '<p class="no-sources">No verifiable claims found in that statement.</p>'
    analyzeBtn.disabled = false
    return
  }

  setStatus(null)

  // Process each claim one at a time
  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i]
    createClaimBlock(claim, i)
    const setting = window.OPTIONS.deeperSearch

    // 1. Search
    setStatus(`[${i + 1}/${claims.length}] Searching sources for: ${claim.claim}`)
    let sources
    try {
      const data = await apiPost('/search', { claim, setting })
      if (data.message) {
        showNoSources(i)
        setStatus(null)
        resultsEl.innerHTML = '<p class="no-sources">No verifiable claims found in that statement.</p>'
        analyzeBtn.disabled = false
        return
      }
      sources = data.results
    } catch (err) {
        console.log(err)
        showNoSources(i)
        continue
    }

    if (!sources.length) { showNoSources(i); continue }

    // 2. Analyze all sources in one call, and then stagger append for cool effects ig
    setStatus(`[${i + 1}/${claims.length}] Analyzing sources...`)
    const analyses = []
    try {
      const data = await apiPost('/analyze-sources', {
        claim: claim.claim,
        sources,
      })
      data.results.forEach((item, j) => {
        item.result.source = sources[j].title
        if (item.result.stance !== 'neutral') {
          analyses.push(item.result)
          console.log(item.result)
        }

        setTimeout(() => {
          if (item.result.stance !== 'neutral') {
            appendSourceCard(i, item.result, item.date)
          }
        }, j * 200)
      })
    } catch {
      // skip failed sources silently
    }

    // 3. Verdict
    if (analyses.length) {
      try {
        const verdict = await apiPost('/verdict', { analyses })
        setVerdictBadge(i, verdict)
        // Summary
        const { summary } = await apiPost('/summary', { claim: claim.claim, analyses })
        setSummary(i, summary)
      } catch { /* skip */ }
    } else {
      showNoSources(i)
      setVerdictBadge(i, { verdict: "NO SOURCE FOUND, LIKELY FALSE OR UNIDENTIFIABLE",  color: '#ff3355' })
    }
  }

  setStatus(null)
  analyzeBtn.disabled = false
}