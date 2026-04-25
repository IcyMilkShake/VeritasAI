// ─── Fetch & clean page content from a URL ───────────────────────────────────
// Input:  url (string)
// Output: string (cleaned text, max ~3000 chars) or null on failure

const USER_AGENT = 'Mozilla/5.0 (compatible; VeritasAI/1.0)'

export async function fetchPageText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

    const html = await res.text()

    // Strip tags, collapse whitespace, cap length
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 3000)

    return text || null
  } catch {
    return null
  }
}