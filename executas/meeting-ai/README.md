# Meeting AI — Executa plugin

Meeting AI as an Anna **Executa tool**: a stdio JSON-RPC 2.0 plugin the Anna agent
can call. It exposes three tools and runs all reasoning through **host sampling**
(`sampling/createMessage`) — **no API key** lives in the plugin.

## Tools
- **detect_question** `{ transcript_chunk, meeting_context }` → `{ is_question, question, confidence }`
- **answer_question** `{ question, meeting_context }` → `{ answer }`
- **summarize_meeting** `{ transcript }` → `{ recap }` (recap + action items/owners + next steps + decisions)

## How it works (protocol)
- Line-delimited **JSON-RPC 2.0 over stdio**. (Never `console.log` — stdout is the channel; logs go to `stderr`.)
- Lifecycle: `initialize` → `describe` → `invoke` → `shutdown`.
- `initialize` negotiates **v2** and declares `capabilities.sampling = {}`.
- During an `invoke`, the plugin sends a reverse RPC **`sampling/createMessage`**; the host runs the model and replies. The host authorizes it with the per-invoke `context.sampling_token`.

## Run / test
```bash
cd executas/meeting-ai
anna-app executa dev                 # describe + invoke against the live host
# or test the protocol locally with a simulated host + sampling:
node test-roundtrip.mjs
```

Example invoke (via the dev CLI):
```bash
anna-app executa dev --invoke detect_question  --args '{"transcript_chunk":"do I need to submit the link today"}'
anna-app executa dev --invoke summarize_meeting --args '{"transcript":"Bob: I will record the demo. Decision: ship."}'
```

This plugin is also bundlable into the Meeting AI Anna App (it ships the same
workflow as a tool); the App UI uses `anna.llm.complete` directly, the plugin uses
host sampling — both are keyless.
