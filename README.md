# Meeting AI — Anna App

Meeting AI as a native **Anna App**: a meeting copilot that **detects questions**,
**answers** them, and **summarizes** the meeting — running entirely on Anna's host
LLM via **`anna.llm.complete()`**. **No API key, no backend** in the app; the
model, quota and billing stay on the Anna Host.

> A second offline path keeps **BYOK** (your own key) for local dev — the desktop
> Meeting AI app's BYOK behavior is untouched.

---

## How it works

The UI bundle imports the Anna App SDK from the host, connects, and calls the LLM:

```js
import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";

const anna  = await AnnaAppRuntime.connect();
const reply = await anna.llm.complete({
  messages: [{ role: "user", content: "…" }],
  systemPrompt: "You are Meeting AI…",
  maxTokens: 700,
});
const text = reply.content.text;     // object form per the host-api-llm reference
```

That call ([`bundle/app.js`](bundle/app.js)) powers all three tasks — detect →
answer → summarize. The `llm` grant is declared in
[`manifest.json`](manifest.json) under `ui.host_api` (without it the host returns
`permission_denied`).

## Layout

```
meeting-ai-anna/
├── manifest.json     # schema-2 Anna App manifest (ui.bundle + ui.host_api: { llm: [complete] })
├── app.json          # store listing (name, tagline, category)
├── bundle/           # the SPA Anna runs in a sandboxed window
│   ├── index.html    # iframe entry
│   └── app.js        # connects to the host + anna.llm.complete()
├── src/ + cli.mjs    # offline BYOK/mock harness (same prompts, no Anna needed)
└── demo/             # sample transcript
```

## Run it on Anna (you're set up — handle `@prash`)

```bash
anna-app validate          # schema + ACL checks on manifest.json
anna-app dev               # runs the app locally → ✓ dashboard http://localhost:5180/
```

`anna-app dev` serves the bundle and provides the host SDK at
`/static/anna-apps/_sdk/latest/index.js`, so `anna.llm.complete()` is live. Open
the dashboard, paste a transcript, hit **Run** → the sample question
*"Can someone explain how this app works on Anna without using a personal API key?"*
is detected → answered → summarized, **with no key in the app**.

Useful flags: `anna-app dev --mock-llm <fixture>` (no live LLM), `--port 5180`.

### Publish (when ready)

```bash
anna-app apps push                 # upsert the mutable working draft
anna-app apps cut 0.1.0            # snapshot an immutable version
anna-app apps release 0.1.0        # go live
```

## Offline dev without Anna (BYOK / mock)

The Node CLI runs the **same prompts** against your own key or a deterministic
mock — handy for iterating on prompt logic without the platform:

```bash
node cli.mjs --invoke detect_question  --args '{"transcript_chunk":"Can you explain the plan?"}'
node cli.mjs --invoke answer_question  --args '{"question":"How does Anna mode work?"}'
node cli.mjs --invoke summarize_meeting --args '{"transcript":"We shipped Anna mode."}'
AI_PROVIDER=byok node demo/run-demo.mjs    # set BYOK_API_KEY for a live BYOK run
```

## Tool contracts

- **detect_question** — `{ transcript_chunk, meeting_context }` → `{ is_question, question, confidence }`
- **answer_question** — `{ question, meeting_context }` → `{ answer }`
- **summarize_meeting** — `{ transcript }` → `{ summary, decisions[], action_items[], follow_up_email }`

## Notes

- `manifest.json` is built to the documented schema-2 shape; run `anna-app validate`
  and, if it flags a field (e.g. the exact `ui.host_api` grant syntax), share the
  message and it's a one-line fix.
- Transcription stays separate (Web Speech / local) — it never uses an AI key.
