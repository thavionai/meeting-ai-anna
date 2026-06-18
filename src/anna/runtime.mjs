// Anna App Runtime adapter — the keyless path. Inside an Anna app the host
// injects `AnnaAppRuntime`; we connect once and call `anna.llm.complete()`.
// No API key, no backend: the model provider, selection, quota and billing all
// stay on the Anna Host; the iframe talks to it through a scoped token.
//
//   const anna  = await AnnaAppRuntime.connect()
//   const reply = await anna.llm.complete({ messages, maxTokens })
//   reply.content[0].text
//
// This is the single Anna integration point. `createAnnaBackend()` returns a
// backend whose `sampler` core.mjs calls for every reasoning task.

let _connected = null

async function connect(runtime) {
  if (runtime) return runtime
  if (_connected) return _connected
  const AR = globalThis.AnnaAppRuntime
  if (!AR || typeof AR.connect !== 'function') {
    throw new Error('AnnaAppRuntime not available — run this inside an Anna app (or use AI_PROVIDER=byok / mock).')
  }
  _connected = await AR.connect()
  return _connected
}

/**
 * Build the Anna backend used by the providers/core.
 * @param {{ runtime?: any }} [opts]  inject a runtime for tests; otherwise uses
 *   the global AnnaAppRuntime.
 */
export function createAnnaBackend(opts = {}) {
  const available = !!opts.runtime || !!globalThis.AnnaAppRuntime
  return {
    id: 'anna',
    label: 'Anna App Runtime (anna.llm.complete)',
    // No personal key. Only mock when the runtime truly isn't present (e.g. the
    // Node CLI) so offline demos still work.
    mock: !available,
    async sampler({ system, user, maxTokens = 700 }) {
      const anna = await connect(opts.runtime)
      const messages = []
      if (system) messages.push({ role: 'system', content: system })
      messages.push({ role: 'user', content: user })
      const reply = await anna.llm.complete({ messages, maxTokens })
      return reply?.content?.[0]?.text ?? ''
    },
  }
}
