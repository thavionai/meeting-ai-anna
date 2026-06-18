# Meeting AI × Anna Platform

Anna integration for **Meeting AI** — a live meeting copilot that **detects
questions**, **generates answers**, and **summarizes** a meeting. On Anna it runs
its reasoning through the **Anna App Runtime** (`anna.llm.complete()`) — **no API
key, no backend**. The model, selection, quota and billing all stay on the Anna
Host; this app just makes the calls.

> **BYOK is not removed.** Anna is added as a second provider — flip `AI_PROVIDER`.

---

## How Anna mode works

Inside an Anna app the host injects `AnnaAppRuntime`. We connect once and call the
LLM with no key:

```js
const anna  = await AnnaAppRuntime.connect()
const reply = await anna.llm.complete({ messages, maxTokens })
render(reply.content[0].text)
```

That single call is the **only** Anna integration point — [`src/anna/runtime.mjs`](src/anna/runtime.mjs).
Every reasoning task (detect / answer / summarize) goes through it.

| | **Anna mode** (`AI_PROVIDER=anna`) | **BYOK mode** (`AI_PROVIDER=byok`) |
|---|---|---|
| Reasoning runs on | **Anna Host** via `anna.llm.complete()` | Your own OpenAI-compatible key |
| Personal API key | **None** | Required |
| Backend / model ops | None — stay in Anna | You manage |
| Transcription | Web Speech / local (never an AI key) | Web Speech / local |

Transcription is deliberately **separate** from reasoning — it never uses an AI
key in either mode.

---

## Run it

Node ≥ 18. No install needed.

### A) The Anna App page (the real Anna path)

```bash
npm run web      # → http://localhost:5174/web/
```

Open it inside an **Anna app** and it calls `anna.llm.complete()` live. Opened
standalone (no `AnnaAppRuntime`), it runs in **mock** mode so you can still see
the flow: paste a transcript → questions are detected → answered → summarized.

### B) The Executa tools / CLI (local dev + BYOK)

Mirrors the Anna CLI shape:

```bash
node cli.mjs --describe
node cli.mjs --invoke detect_question  --args '{"transcript_chunk":"Can you explain the plan?"}'
node cli.mjs --invoke answer_question  --args '{"question":"How does Anna mode work?"}'
node cli.mjs --invoke summarize_meeting --args '{"transcript":"We shipped Anna mode. Bob records the demo."}'

# Full flow over the sample transcript
AI_PROVIDER=anna node demo/run-demo.mjs   # or AI_PROVIDER=byok
```

On the platform these map to `anna-app executa dev --describe` /
`--invoke <tool> --args '{...}'`.

> The Node CLI has no `AnnaAppRuntime`, so `AI_PROVIDER=anna` there runs in mock.
> For a real Anna LLM call, use the web app (A) inside an Anna app, or BYOK (B).

---

## Tool contracts

**detect_question** — in `{ transcript_chunk, meeting_context }` →
out `{ is_question, question, confidence }`

**answer_question** — in `{ question, meeting_context }` → out `{ answer }`

**summarize_meeting** — in `{ transcript }` →
out `{ summary, decisions[], action_items[], follow_up_email }`

## Layout

```
meeting-ai-anna/
  web/                  # the Anna App page (anna.llm.complete)
    index.html
    app.mjs
  serve.mjs             # zero-dep static server for the page
  cli.mjs               # Executa dev runner (--describe / --invoke)
  executa.json          # Executa tool manifest
  app-manifest.json     # Anna app manifest
  src/
    anna/runtime.mjs    # ← Anna integration point: anna.llm.complete()
    providers/          # annaProvider · byokProvider · resolver
    core.mjs            # shared detect/answer/summarize (+ offline mock)
    llm.mjs             # BYOK OpenAI-compatible HTTP call
    prompts.mjs · tools.mjs · config.mjs
  demo/                 # sample transcript + run-demo.mjs
```

## Hackathon demo steps

1. `npm run web` and open the page inside your Anna app.
2. The sample transcript's question *"Can someone explain how this app works on
   Anna without using a personal API key?"* is **detected → answered → summarized**
   — all via `anna.llm.complete()`, **no key in the page**.
3. Switch to BYOK anytime: `AI_PROVIDER=byok node demo/run-demo.mjs`.

## Status

- ✅ Anna mode via the App Runtime (`anna.llm.complete`) — keyless.
- ✅ BYOK mode intact (the desktop Meeting AI app is untouched).
- ✅ All three Executa tools + CLI + web app + offline mock.
- ⏳ `executa.json` / `app-manifest.json` field names are best-effort pending
  Anna's published manifest spec — the tool logic and the runtime call are real.
