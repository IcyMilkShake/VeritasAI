# VERITAS — AI-Powered Fact Checker

> Automated claim verification using real-time web search and large language model analysis.

---

## What Is Veritas?

Veritas is a fact-checking tool that takes any statement, extracts the verifiable claims inside it, searches the web for relevant sources, and returns a verdict on whether each claim is likely true, false, contested, or unverified — all in seconds.

It is built for anyone who wants a fast, source-backed second opinion on something they read, heard, or want to verify or just curious people who don't want to be misled.

## I want to use/test it out!

You may test it on [https://veritas.ipo-servers.net/](https://veritas.ipo-servers.net/) !

## I want to fork or use the codebase

You will need:
- Node.js 18+
- An [OpenAI API key](https://platform.openai.com)
- A [SerpAPI key](https://serpapi.com)

Create a `.env` file in the root:
```env
OPENAI_KEY=your_openai_key
SERP_API_KEY=your_serpapi_key
```

Then:
```bash
npm install
node server.js
```

- The app will run on `http://localhost:8081`.
- !!Dont forget to update the production URL in `server.js` to match your own domain if deploying!!


---

## Tech Stack

- **GPT-5.4 nano** — Claim extraction, summarization
- **GPT-5.4 mini** — Source analysis, gap analysis
- **SerpAPI (Google Search)** — Real-time web search, organic results
- **Node.js / Express** — Backend server and API routing
- **Vanilla JS Frontend** — Browser-based UI, no framework

GPT-5.4 nano is used for lighter tasks (extraction, summarization) to reduce cost.
GPT-5.4 mini handles the heavier analysis and reasoning steps.

All intelligence is driven by **system prompting** — each stage of the pipeline has a carefully engineered system prompt that instructs the model on exactly how to reason, what rules to follow, and what format to return.

---

## How It Works — Standard Analysis

### Step 1 — Claim Extraction
The user's raw input is passed to GPT-5.4 nano with a prompt that:
- Strips conversational filler ("my friend told me...", "I heard that...", "apparently...")
- Identifies only the verifiable factual claims inside the statement
- Removes opinions, preferences, and unverifiable assertions
- Flags each claim as time-sensitive or not

If the input contains no verifiable claims, the pipeline stops early.

Alternatively,if mistakes were to occur at this step the user can toggle **Force User Claim** to skip extraction and treat the raw input as the claim directly.

### Step 2 — Query Generation
Each claim is passed to a query generation prompt that produces:
- An optimized, unbiased Google search query (This is to prevent biased searches, bringing most 'relevant' news and could lead to misinformation)
- A Google country code (`gl`) to surface the most geographically relevant results

The prompt enforces **bias removal** — specific numbers, conclusions, and verdicts from the claim are never included in the query. The goal is to let sources tell us the answer, not confirm what the claim already says.

Examples:
- "Thailand raised VAT to 10%" → `Thailand VAT rate change`
- "Trump has had 2 assassination attempts" → `Trump assassination attempts total`
- "Apple is worth 4 trillion dollars" → `Apple market cap current`

### Step 3 — Web Search
The query is sent to **SerpAPI** (Google organic search). Up to 10 results are returned including title, snippet, link, and date. The Page text is then extracted (max of 6000, believed to be enough to capture the main content of most articles) for all results to give the model richer context beyond just the snippet.

### Step 4 — Bulk Source Analysis
All sources are passed together in a single GPT-5.4 mini call. The model analyzes each source independently and returns a structured analysis for every one:

- **Stance** — `support`, `contradict`, or `neutral`
- **Confidence** — 0.0 to 1.0 scale
- **Summary** — 1–3 sentence explanation of what the source says and why it supports or contradicts the claim

The analysis prompt enforces strict rules including:
- Tense matching (past tense claims require completed actions, not proposals)
- Entity matching (sources about related but different people/companies are marked neutral)
- Scope matching (claims requiring full confirmation vs partial confirmation)
- Date-aware reasoning (source publication date vs claim date)
- Number anchoring prevention (model cannot match numbers without full context)

### Step 5 — Verdict Scoring
All stances and confidence scores are fed into a weighted scoring algorithm:

- Each source contributes `stance_score × confidence` to a weighted sum
- Final score maps to a verdict: **LIKELY TRUE**, **UNVERIFIED**, **CONTESTED**, or **LIKELY FALSE**
- Score breakdown (support / neutral / contradict counts) is also returned

### Step 6 — Final Summary
All source summaries are passed to a summarizer (GPT-5.4 nano) which produces a 2–5 sentence plain English explanation of what is actually true — written as if explaining directly to the user, not reviewing sources. If 2 or more sources consistently point to a specific date, number, or name that differs from the claim, it is explicitly included in the summary.
In some cases, if information is half correct the summary will explain so. It is advised to read final summary for the full context and result of the analysis.

---

## How It Works — Deep Analysis

Deep Analysis is an optional mode that runs a more thorough, multi-phase investigation for complex and ambiguous claims

### Phase 1 — Triple Query Search
Instead of one query, the claim is analyzed to produce **3 different search queries**, each approaching the claim from a different angle:
- **Query 1** — Direct fact verification (what is the current value or status?)
- **Query 2** — The specific event or announcement that would confirm or deny the claim
- **Query 3** — Broader context, background, or date-anchored search if the claim mentions a specific date

All 3 searches run in parallel (5 results each), results are deduplicated by URL, and all unique sources are fetched and analyzed together — producing a **draft verdict**.

### Phase 2 — Gap Analysis
The draft verdict and all phase 1 source summaries are passed to a gap analysis prompt that asks:
- What key facts are still missing or unverified?
- Are there contradictions that need resolving?
- What additional searches would strengthen or change the verdict?

Up to 3 targeted follow-up queries are generated. If the draft verdict is already well-supported, no follow-up queries are produced and the pipeline ends early.

### Phase 3 — Targeted Follow-Up Search
Each follow-up query runs a fresh search (5 results each), again deduplicated against everything already seen. New sources are fetched and analyzed with full awareness of what phase 1 already found.

### Phase 4 — Final Verdict + Summary
All sources from phase 1 and phase 3 are combined. A final weighted verdict is computed across all of them, and a longer 4–5 sentence summary is generated covering the full picture including any corrections, context, and additional facts found during the deeper investigation.

Phase 2 sources are marked with a **⬡ DEEP** badge in the UI so the user can see which sources came from the follow-up investigation.

---

## UI Features

- **Live source cards** — sources appear one by one as results stream in, showing stance, confidence bar, date, and summary per source
- **Verdict badge** — color-coded result shown inline with each claim (green / yellow / orange / red)
- **Claim summary** — plain English explanation shown below each claim header
- **⚡ LIVE badge** — shown on time-sensitive claims
- **⬡ DEEP badge** — shown on sources found during deep analysis follow-up
- **Force User Claim** — skip claim extraction, treat raw input as the claim
- **Deeper Search** — enable the full multi-phase deep analysis pipeline
- **Character counter** — 500 character limit with warning at 450

---

## Veritas System Prompting Principle

- **Bias removal first** — queries are never allowed to confirm the claim, only investigate the topic
- **Source independence** — each source is judged on its own merits, not influenced by other sources
- **Tense awareness** — a proposal is not a completion; the model is explicitly prompted to respect this
- **Confidence over certainty** — when in doubt, the model defaults to lower confidence rather than overclaiming
- **No hallucination by design** — the model is only allowed to use provided source content, never its own knowledge

I hope this project of mine can be proven useful for some of the users ✧ദ്ദി( ˶^ᗜ^˶ )
