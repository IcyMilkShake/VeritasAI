const API = "/api";

const statementEl = document.getElementById("statement");
const charCountEl = document.getElementById("char-count");
const analyzeBtn  = document.getElementById("analyze-btn");
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

// ── Image upload ──────────────────────────────────────────────────────────────
const imageBtn        = document.getElementById('image-btn')
const imageInput      = document.getElementById('image-input')
const imageConfirmEl  = document.getElementById('image-confirm')
const imageTextEl     = document.getElementById('image-text')
const imageAcceptBtn  = document.getElementById('image-accept')
const imageDismissBtn = document.getElementById('image-dismiss')

imageBtn.addEventListener('click', () => imageInput.click())

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0]
  if (!file) return

  setStatus('Extracting text from image...')
  imageBtn.disabled = true

  try {
    const base64 = await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result.split(',')[1])
      reader.onerror = () => rej(new Error('Failed to read image'))
      reader.readAsDataURL(file)
    })

    const { text } = await apiPost('/extract-from-image', { image: base64, mimeType: file.type })

    if (!text) {
      setStatus('No verifiable claim found in image.')
      imageBtn.disabled = false
      imageInput.value = ''
      return
    }

    // show confirmation box with extracted text
    imageTextEl.value = text
    imageConfirmEl.classList.remove('hidden')
    setStatus(null)

  } catch (err) {
    console.error('[image-upload]', err)
    setStatus('Image extraction failed.')
  }

  imageBtn.disabled = false
  imageInput.value = ''
})

imageAcceptBtn.addEventListener('click', () => {
  const extracted = imageTextEl.value.trim()
  if (!extracted) return

  // combine with existing text or set as new
  const existing = statementEl.value.trim()
  statementEl.value = existing ? `${existing} ${extracted}` : extracted

  // update char counter
  const len = statementEl.value.length
  charCountEl.textContent = `${len}/500`
  charCountEl.classList.toggle('warn', len > 450)
  analyzeBtn.disabled = len === 0

  imageConfirmEl.classList.add('hidden')
})

imageDismissBtn.addEventListener('click', () => {
  imageConfirmEl.classList.add('hidden')
})

// ── Paste image support ───────────────────────────────────────────────────────
document.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items
  if (!items) return

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (!file) continue

      setStatus('Extracting text from image...')
      imageBtn.disabled = true

      try {
        const base64 = await new Promise((res, rej) => {
          const reader = new FileReader()
          reader.onload = () => res(reader.result.split(',')[1])
          reader.onerror = () => rej(new Error('Failed to read image'))
          reader.readAsDataURL(file)
        })

        const { text } = await apiPost('/extract-from-image', { image: base64, mimeType: file.type })

        if (!text) {
          setStatus('No verifiable claim found in image.')
          imageBtn.disabled = false
          return
        }

        imageTextEl.value = text
        imageConfirmEl.classList.remove('hidden')
        setStatus(null)

      } catch (err) {
        console.error('[paste-image]', err)
        setStatus('Image extraction failed.')
      }

      imageBtn.disabled = false
      break // only process first image if multiple items pasted
    }
  }
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

function appendSourceCard(idx, analysis, date, isPhase2 = false) {
  const body = document.getElementById(`body-${idx}`)
  const stanceMeta = {
    support:    { label: 'SUPPORTS',    cls: 'support' },
    contradict: { label: 'CONTRADICTS', cls: 'contradict' },
  }
  const m = stanceMeta[analysis.stance] ?? { label: analysis.stance.toUpperCase(), cls: 'neutral' }
  const pct = Math.round((analysis.confidence ?? 0.5) * 100)
  const dateStr = date ? `<span class="source-date">${escapeHtml(date)}</span>` : ''
  const phase2Badge = isPhase2 ? '<span class="badge-deep">⬡ DEEP</span>' : ''

  const card = document.createElement('div')
  card.className = `source-card ${m.cls}`
  card.innerHTML = `
    <div class="source-top">
      <span class="source-title">${escapeHtml(analysis.source)}</span>
      ${phase2Badge}
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

    if (window.OPTIONS.deeperSearch) {
      //deep analysis
      setStatus(`[${i + 1}/${claims.length}] Deep searching: ${claim.claim}`)
      try {
        const data = await apiPost('/deep-analyze', { claim: claim.claim })
        if (!data.sources.phase1.length && !data.sources.phase2.length) {
          showNoSources(i)
          setVerdictBadge(i, { verdict: "NO SOURCE FOUND, LIKELY FALSE OR UNIDENTIFIABLE", color: '#ff3355' })
          continue
        }

        // add the normal analysis stuff
        data.sources.phase1.forEach((item, j) => {
          setTimeout(() => appendSourceCard(i, item.result, item.date), j * 200)
        })

        // show draft verdict while phase 2 loads
        setVerdictBadge(i, data.draftVerdict)

        // add the deep analysis stuff
        const offset = data.sources.phase1.length * 200
        data.sources.phase2.forEach((item, j) => {
          setTimeout(() => appendSourceCard(i, item.result, item.date, true), offset + j * 200)
        })

        // final verdict + summary after all cards
        const totalDelay = (data.sources.phase1.length + data.sources.phase2.length) * 200
        setTimeout(() => {
          setVerdictBadge(i, data.finalVerdict)
          setSummary(i, data.finalSummary)
        }, totalDelay)

      } catch (err) {
        console.log(err)
        showNoSources(i)
        continue
      }

    } else {
      // normal analysis
      // 1. Search
      setStatus(`[${i + 1}/${claims.length}] Searching sources for: ${claim.claim}`)
      let sources
      try {
        const data = await apiPost('/search', { claim })
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
  }

  setStatus(null)
  analyzeBtn.disabled = false
}