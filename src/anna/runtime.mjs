// Anna App Runtime adapter for the Node side (CLI/tests). The browser bundle
// (bundle/app.js) is the real Anna App and imports the SDK directly:
//   import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js"
//   const anna = await AnnaAppRuntime.connect()
//
// Here we just wrap a connected `anna` handle so the shared core can call it.
// In Node there's no host SDK, so without an injected handle this stays in mock
// mode (the offline demo path). Pass { anna } to drive a real host.
//
// Request/response per Anna's host-api-llm reference:
//   anna.llm.complete({ messages, systemPrompt, maxTokens }) →
//     { role, content: { type:'text', text }, model, usage }

export function createAnnaBackend(opts = {}) {
  const anna = opts.anna || null
  return {
    id: 'anna',
    label: 'Anna App Runtime (anna.llm.complete)',
    mock: !anna, // no host handle → offline mock (e.g. the Node CLI)
    async sampler({ system, user, maxTokens = 700 }) {
      const reply = await anna.llm.complete({
        messages: [{ role: 'user', content: user }],
        systemPrompt: system,
        maxTokens,
      })
      // Reference shape is content.text (object); tolerate array form too.
      return reply?.content?.text ?? reply?.content?.[0]?.text ?? ''
    },
  }
}
