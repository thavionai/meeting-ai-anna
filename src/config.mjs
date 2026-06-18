// Configuration + backend resolution for the Meeting AI ↔ Anna integration.
//
// Two AI backends:
//   • anna — the Anna App Runtime (anna.llm.complete) — no personal key; the
//            model stays on the Anna Host. See src/anna/runtime.mjs.
//   • byok — the user's own OpenAI-compatible key. See src/llm.mjs.
//
// Select with AI_PROVIDER=byok | anna  (default: byok).
// With no credentials / no Anna runtime (or MOCK=1), every tool still runs
// against a deterministic local mock so the hackathon demo works with zero setup.

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
