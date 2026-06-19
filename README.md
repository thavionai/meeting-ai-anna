# Meeting AI on Anna

A meeting copilot that **detects questions**, **answers** them, and **recaps** the
meeting (with action items, owners, and next steps) — running entirely on Anna's
host LLM. **No API key, no backend**: the model, quota, and billing stay on the
Anna Host.

Two **live** surfaces, both keyless:

| Surface | How it calls the model | Run |
|---|---|---|
| **Anna App** (UI bundle) | `anna.llm.complete()` via the App SDK | `anna-app dev` |
| **Executa plugin** (tool) | reverse `sampling/createMessage` over stdio | `anna-app executa dev` |

---

## Anna App — `anna.llm.complete()`

The UI bundle imports the App SDK from the host, connects, and calls the LLM:

```js
import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js";
const anna  = await AnnaAppRuntime.connect();
const reply = await anna.llm.complete({ messages, systemPrompt, maxTokens });
const text  = reply.content.text;
```

That powers the live UI ([`bundle/app.js`](bundle/app.js)): paste or 🎤 speak a
transcript → questions are detected and answered live → **Recap** produces the
summary, action items + owners, and next steps for review → **Share** / save to
the Anna chat. History persists via `anna.storage`. Grants are declared in
[`manifest.json`](manifest.json) under `ui.host_api`.

```bash
anna-app validate
anna-app dev          # → http://localhost:5180/
```

## Executa plugin — host sampling

Meeting AI is also an Anna **Executa tool** ([`executas/meeting-ai/`](executas/meeting-ai/)):
a stdio JSON-RPC 2.0 plugin exposing `detect_question`, `answer_question`,
`summarize_meeting`. It negotiates v2 (`capabilities.sampling = {}`) and runs every
call through the host via reverse `sampling/createMessage` — no key in the plugin.

```bash
cd executas/meeting-ai
anna-app executa dev            # drive it against the live host
node test-roundtrip.mjs         # or test the protocol with a simulated host
```

## Layout

```
meeting-ai-anna/
├── manifest.json            # schema-2 Anna App manifest (ui.bundle + ui.host_api grants)
├── app.json                 # store listing (name, tagline, category)
├── bundle/                  # the Anna App SPA (anna.llm.complete)
│   ├── index.html
│   └── app.js
├── executas/meeting-ai/     # the Executa plugin (host sampling)
│   ├── plugin.mjs
│   └── test-roundtrip.mjs
├── demo/sample-transcript.txt
└── SUBMISSION.md            # notes + demo steps
```

## Tool contracts

- **detect_question** — `{ transcript_chunk, meeting_context }` → `{ is_question, question, confidence }`
- **answer_question** — `{ question, meeting_context }` → `{ answer }`
- **summarize_meeting** — `{ transcript }` → `{ recap }` (recap · action items + owners · next steps · decisions)

## Publish

```bash
anna-app apps push                  # update the working draft
anna-app apps cut 0.1.0             # snapshot an immutable version
anna-app apps submit-review         # request admin review
anna-app apps release 0.1.0         # go live once APPROVED
```

Notes: live transcription uses the browser Web Speech API (key-free, separate from
the model). Real file downloads need an account-level `upload_grant`; without it,
export posts the conversation into the Anna chat (`chat.append_artifact`).
