// Low-level LLM call. One OpenAI-compatible path serves both BYOK and Anna —
// only the backend descriptor (baseURL / key / model) differs.

/**
 * Non-streaming chat completion against an OpenAI-compatible endpoint.
 * @param {object} backend  from config.mjs (baseURL, key, model, tokenParam)
 * @param {Array<{role:string,content:string}>} messages
 * @param {{maxTokens?:number, json?:boolean}} [opts]
 * @returns {Promise<string>} the assistant message content
 */
export async function chatComplete(backend, messages, opts = {}) {
  const { maxTokens = 1024, json = false } = opts
  const body = { model: backend.model, messages }
  body[backend.tokenParam || 'max_tokens'] = maxTokens
  if (json) body.response_format = { type: 'json_object' }

  // ⚠️ Anna INTEGRATION POINT — if Anna's Sampling API is not OpenAI-compatible,
  // branch here on backend.id === 'anna' and shape the request/response to match.
  const res = await fetch(`${backend.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(backend.key ? { Authorization: `Bearer ${backend.key}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = typeof j.error === 'string' ? j.error : j.error?.message ?? ''
    } catch { /* non-JSON */ }
    throw new Error(`${backend.label} request failed (${res.status})${detail ? ': ' + detail : ''}`)
  }

  const j = await res.json()
  return j.choices?.[0]?.message?.content ?? ''
}

/** Parse a model reply that should be JSON, tolerating ```json fences/prose. */
export function parseJsonReply(text) {
  if (!text) return null
  let s = text.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) s = s.slice(start, end + 1)
  try { return JSON.parse(s) } catch { return null }
}
