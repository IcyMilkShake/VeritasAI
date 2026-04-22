// ─── Step 3: Score analyses and compute final verdict ────────────────────────
// Input:  analyses [{ stance, confidence }]
// Output: { verdict, score, color, breakdown }

const STANCE_SCORE = { support: 1, neutral: 0, contradict: -1 }

export function computeVerdict(analyses) {
  if (!analyses.length) {
    return { verdict: 'NO SOURCES', score: 0, color: '#555555', breakdown: {} }
  }

  let weightedSum = 0
  let totalConf   = 0
  const breakdown = { support: 0, neutral: 0, contradict: 0 }

  for (const a of analyses) {
    const w = a.confidence ?? 0.5
    weightedSum += (STANCE_SCORE[a.stance] ?? 0) * w
    totalConf   += w
    if (a.stance in breakdown) breakdown[a.stance]++
  }

  const score = totalConf ? weightedSum / totalConf : 0

  let verdict, color
  if      (score >  0.4) { verdict = 'LIKELY TRUE';  color = '#00ff88' }
  else if (score >  0.1) { verdict = 'UNVERIFIED';   color = '#ffcc00' }
  else if (score > -0.1) { verdict = 'CONTESTED';    color = '#ff8800' }
  else                   { verdict = 'LIKELY FALSE';  color = '#ff3355' }

  return { verdict, score: +score.toFixed(3), color, breakdown }
}