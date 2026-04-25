const API = "/api";

const statementEl = document.getElementById("statement");
const charCountEl = document.getElementById("char-count");
const analyzeBtn  = document.getElementById("analyze-btn");
const resetBtn    = document.getElementById("reset-btn");
const statusEl    = document.getElementById("status");
const statusText  = document.getElementById("status-text");
const resultsEl   = document.getElementById("results");

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

function appendSourceCard(idx, analysis) {
  const body = document.getElementById(`body-${idx}`)
  const stanceMeta = {
    support:    { label: 'SUPPORTS',    cls: 'support' },
    contradict: { label: 'CONTRADICTS', cls: 'contradict' },
  }
  const m = stanceMeta[analysis.stance] ?? { label: analysis.stance.toUpperCase(), cls: 'neutral' }
  const pct = Math.round((analysis.confidence ?? 0.5) * 100)

  const card = document.createElement('div')
  card.className = `source-card ${m.cls}`
  card.innerHTML = `
    <div class="source-top">
      <span class="source-title">${escapeHtml(analysis.source)}</span>
      <span class="stance-badge ${m.cls}">${m.label}</span>
    </div>
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

async function onAnalyze() {
    const statement = statementEl.value.trim();
    if (!statement) return;
    console.log("Analyzing starts")
    analyzeBtn.disabled = true;
    resetBtn.classList.remove("hidden");
    resultsEl.innerHTML = "";
    setStatus("Extracting claims...");

  let claims
  try {
    const claimData = await apiPost('/extract-claims', { statement })
    claims = claimData.claims
  } catch (err) {
    setStatus(`Error: ${err.message}`)
    analyzeBtn.disabled = false
    return
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

    // 1. Search
    setStatus(`[${i + 1}/${claims.length}] Searching sources for: ${claim.claim}`)
    let sources
    try {
      const data = await apiPost('/search', { claim })
      sources = data.results
    } catch (err) {
        console.log(err)
        showNoSources(i)
        continue
    }

    if (!sources.length) { showNoSources(i); continue }

    // 2. Analyze each source — one at a time, append as they come in
    const analyses = []
    for (let j = 0; j < sources.length; j++) {
      setStatus(`[${i + 1}/${claims.length}] Analyzing source ${j + 1}/${sources.length}...`)
      try {
        const result = await apiPost('/analyze-source', {
          claim: claim.claim,
          source: sources[j],
        })
        if (!result.filtered) {
          analyses.push(result)
          appendSourceCard(i, result)  // show immediately as it comes in
        }
      } catch {
        // skip failed sources silently
      }
    }

    // 3. Verdict
    if (analyses.length) {
      try {
        const verdict = await apiPost('/verdict', { analyses })
        setVerdictBadge(i, verdict)
      } catch { /* skip */ }
    } else {
      showNoSources(i)
      setVerdictBadge(i, { verdict: "NO SOURCE FOUND, LIKELY FALSE OR UNIDENTIFIABLE",  color: '#ff3355' })
    }
  }

  setStatus(null)
  analyzeBtn.disabled = false
}