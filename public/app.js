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

async function onAnalyze() {
    const statement = statementEl.value.trim();
    if (!statement) return;
    console.log("Analyzing starts")
    analyzeBtn.disabled = true;
    resetBtn.classList.remove("hidden");
    resultsEl.innerHTML = "";
    setStatus("Extracting claims...");

    //wire
    const claim = await fetch('/api/extract-claims', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ statement })
    })
    const claimData = await claim.json()
    console.log("Data: ",claimData)

    
    const claimText = claimData.claims[0].claim;
    const sources = claimData.searchResults;
    console.log(claimText, sources)

    const analyzeResults = await Promise.all(
    sources.map(async (source) => {
        const res = await fetch('/api/analyze-source', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            claim: claimText,
            source: source
        })
        });

        return res.json();
    })
    );

    console.log("Analyze results:", analyzeResults);
    
    setTimeout(() => {
        setStatus(null);
        analyzeBtn.disabled = false;
    }, 1500);
}