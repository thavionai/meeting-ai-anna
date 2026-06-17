// Configuration + backend resolution for the Meeting AI ↔ Anna integration.
//
// Two AI backends share one calling shape (OpenAI-compatible chat completions):
//   • byok — the user's own key (OpenAI / Groq / Anthropic / Gemini, etc.)
//   • anna — the Anna Platform's hosted LLM / Sampling API (no personal key)
//
// Select with AI_PROVIDER=byok | anna  (default: byok).
// If no credentials are configured (or MOCK=1), every tool still runs against a
// deterministic local mock so the hackathon demo works with zero setup.

const env = process.env

export const AI_PROVIDER = (env.AI_PROVIDER || 'byok').toLowerCase()
export const FORCE_MOCK = env.MOCK === '1' || env.MOCK === 'true'

/** BYOK backend — any OpenAI-compatible endpoint using the user's own key. */
export function byokBackend() {
  const key = env.BYOK_API_KEY || env.OPENAI_API_KEY || ''
  return {
    id: 'byok',
    label: 'BYOK (your own key)',
    baseURL: env.BYOK_API_URL || 'https://api.openai.com/v1',
    key,
    model: env.BYOK_MODEL || 'gpt-4o-mini',
    tokenParam: 'max_tokens',
    mock: FORCE_MOCK || !key,
  }
}

/**
 * Anna backend — the Anna Platform hosted LLM / Sampling API.
 *
 * ⚠️ INTEGRATION POINT: the exact Anna Sampling API (base URL, auth header,
 * request body) is not publicly documented. We default to the common
 * OpenAI-compatible shape: POST {baseURL}/chat/completions with a Bearer token.
 * To match Anna's real API, set ANNA_API_URL / ANNA_API_TOKEN / ANNA_MODEL —
 * or adjust the request in src/llm.mjs (callOpenAICompatible) — that is the
 * ONLY place that needs to change.
 */
export function annaBackend() {
  const key = env.ANNA_API_TOKEN || env.ANNA_API_KEY || ''
  return {
    id: 'anna',
    label: 'Anna Platform (hosted LLM)',
    baseURL: env.ANNA_API_URL || 'https://api.anna.platform/v1',
    key,
    model: env.ANNA_MODEL || 'anna-default',
    tokenParam: 'max_tokens',
    // Anna provides the model, so we don't require a personal key. We only fall
    // back to mock when nothing is configured at all (so the demo still runs).
    mock: FORCE_MOCK || (!key && !env.ANNA_API_URL),
  }
}

export function backendFor(provider = AI_PROVIDER) {
  return provider === 'anna' ? annaBackend() : byokBackend()
}
