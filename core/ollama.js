// ─── Shared Ollama caller ─────────────────────────────────────────────────────

const OLLAMA_URL = 'http://localhost:11434/api/chat'

export async function callOllama(model, messages, options = {}) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      messages,
      ...options,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Ollama error ${res.status}`)
  return (data.message?.content ?? '').trim()
}

export function parseJSON(text) {
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}