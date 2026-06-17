# Meeting AI × Anna Platform

Anna Platform integration for **Meeting AI** — a live meeting copilot that listens to
a transcript, **detects questions**, **generates answers**, and **summarizes** the
meeting. This package lets Meeting AI run its reasoning on **Anna's hosted LLM /
Sampling API** instead of a personal OpenAI/Anthropic key.

> **BYOK is not removed.** Anna is added as a second provider. Flip one env var.

---

## What Meeting AI does

1. Captures live voice → transcribes to text (Web Speech API / local — **no AI key needed**).
2. Detects whether a transcript chunk contains a real question.
3. Generates a live answer.
4. Optionally summarizes the meeting (decisions, action items, follow-up email).

Steps 2–4 are the **reasoning** tasks. This package exposes them as Anna Executa
tools so they run on Anna.

## BYOK mode vs Anna mode

| | **BYOK mode** (`AI_PROVIDER=byok`) | **Anna mode** (`AI_PROVIDER=anna`) |
|---|---|---|
| Reasoning runs on | Your own provider key (OpenAI/Groq/Claude/Gemini) | **Anna's hosted LLM** |
| Personal API key | Required | **Not required** |
| Transcription | Web Speech / local (never uses your AI key) | Web Speech / local |
| Use case | Personal/desktop use | Anna Platform / hackathon demo |

Transcription is deliberately kept **separate** from reasoning — it never consumes
an AI key in either mode.

---

## Layout

```
meeting-ai-anna/
  executa.json          # Anna Executa tool manifest (3 tools)
  app-manifest.json     # Anna app manifest (name, description, capabilities)
  cli.mjs               # dev runner — mirrors `anna-app executa dev`
  .env.example          # configuration
  src/
    config.mjs          # provider/backend resolution (AI_PROVIDER, Anna/BYOK env)
    llm.mjs             # OpenAI-compatible call  ← Anna API integration point
    prompts.mjs         # detect / answer / summarize prompts
    core.mjs            # shared tool logic + offline mock
    providers/
      byokProvider.mjs  # BYOK provider
      annaProvider.mjs  # Anna provider
      index.mjs         # resolveProvider(AI_PROVIDER)
    tools.mjs           # the 3 Executa tools + describe/invoke
  demo/
    sample-transcript.txt
    run-demo.mjs        # transcript → detect → answer → summarize
```

---

## Run locally

Requires **Node ≥ 18** (uses built-in `fetch`). No install needed for the demo.

```bash
cp .env.example .env        # optional — works with zero config (mock mode)

# Pick a provider
export AI_PROVIDER=anna      # or: byok

# End-to-end demo on the sample transcript
node demo/run-demo.mjs
```

With **no credentials** every tool runs against a deterministic **mock**, so the
demo always works. Add real credentials (below) to go live.

## Test the Executa tools

Local dev runner (`cli.mjs`) — same shape as the Anna CLI:

```bash
# Describe the tool + active provider
node cli.mjs --describe

# detect_question
node cli.mjs --invoke detect_question \
  --args '{"transcript_chunk":"Can someone explain how this works on Anna?","meeting_context":"hackathon"}'

# answer_question
node cli.mjs --invoke answer_question \
  --args '{"question":"How does Anna mode work?","meeting_context":"hackathon"}'

# summarize_meeting
node cli.mjs --invoke summarize_meeting \
  --args '{"transcript":"We shipped Anna mode. Bob records the demo."}'
```

On the Anna Platform these map to:

```bash
anna-app executa dev --describe
anna-app executa dev --invoke detect_question  --args '{...}'
anna-app executa dev --invoke answer_question  --args '{...}'
anna-app executa dev --invoke summarize_meeting --args '{...}'
```

## Tool contracts

**detect_question** — in `{ transcript_chunk, meeting_context }` →
out `{ is_question, question, confidence }`

**answer_question** — in `{ question, meeting_context }` → out `{ answer }`

**summarize_meeting** — in `{ transcript }` →
out `{ summary, decisions[], action_items[], follow_up_email }`

---

## Going live with Anna

Set these (e.g. in `.env`) and reasoning routes through Anna with **no personal key**:

```bash
AI_PROVIDER=anna
ANNA_API_URL=...     # Anna Sampling API base URL
ANNA_API_TOKEN=...   # Anna session/app token
ANNA_MODEL=...       # model Anna exposes
```

> ⚠️ **One integration point.** The default call assumes an OpenAI-compatible
> `POST {ANNA_API_URL}/chat/completions` with a Bearer token. If Anna's Sampling
> API differs, the **only** place to adjust is `chatComplete()` in
> [`src/llm.mjs`](src/llm.mjs) (and the endpoint defaults in
> [`src/config.mjs`](src/config.mjs)). Everything else is provider-agnostic.
>
> `executa.json` / `app-manifest.json` field names are best-effort pending Anna's
> published manifest spec — the tool logic and CLI are real and runnable today.

## Hackathon demo steps

1. `export AI_PROVIDER=anna`
2. `node cli.mjs --describe` → shows the 3 tools running on the Anna provider.
3. `node demo/run-demo.mjs` → the sample transcript's question
   *"Can someone explain how this app works on Anna without using Prashanth's API key?"*
   is detected → answered → meeting summarized — **without any personal API key**.
4. (Live) set `ANNA_API_URL`/`ANNA_API_TOKEN` to swap the mock for Anna's real LLM.

## BYOK still works

`AI_PROVIDER=byok node demo/run-demo.mjs` runs the identical flow on your own key —
the desktop Meeting AI app's BYOK behavior is untouched by this package.
