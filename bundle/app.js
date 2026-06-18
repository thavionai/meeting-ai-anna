// Meeting AI — Anna App bundle. Self-contained SPA: it imports the Anna App SDK
// from the host, connects, and runs every reasoning task through
// `anna.llm.complete()`. No API key, no backend — the model stays on the Host.
//
// SDK + signatures per Anna docs:
//   import { AnnaAppRuntime } from "/static/anna-apps/_sdk/latest/index.js"
//   const anna  = await AnnaAppRuntime.connect()
//   const reply = await anna.llm.complete({ messages, systemPrompt, maxTokens })
//   reply.content.text            (object form per reference; array form tolerated)

import { AnnaAppRuntime } from '/static/anna-apps/_sdk/latest/index.js'

const $ = (id) => document.getElementById(id)
const out = $('out')

const DETECT_SYSTEM =
  'You are Meeting AI. The chunk is live speech-to-text — it may be unpunctuated and ' +
  'contain several sentences. If ANY part is a question a participant wants answered, set ' +
  'is_question true and put the single most important question (cleaned up, ending with a ' +
  'question mark) in "question". Greetings/small talk are not questions. ' +
  'Return JSON only: {"is_question":boolean,"question":string,"confidence":number}.'
const ANSWER_SYSTEM =
  'You are Meeting AI, a live meeting copilot. Answer the question using the meeting context. ' +
  'Be concise, professional, and speakable. Do not refer to yourself as an AI.'
const SUMMARIZE_SYSTEM =
  'You are Meeting AI. Write a concise recap of the meeting transcript with short labelled ' +
  'sections: Summary (one short paragraph), Decisions, Action items, and a brief Follow-up email. ' +
  'If a section has nothing, write "None". Plain text / simple markdown — do NOT return JSON.'

let anna = null

/** One LLM call through the Anna host. Retries once if the model returns empty
 *  text (the shared demo model occasionally yields an empty completion). */
async function complete(system, user, maxTokens = 600) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const reply = await anna.llm.complete({
      messages: [{ role: 'user', content: user }],
      systemPrompt: system,
      maxTokens,
      modelPreferences: { speedPriority: 0.8, intelligencePriority: 0.3, costPriority: 0.5 },
    })
    const text = reply?.content?.text ?? reply?.content?.[0]?.text ?? ''
    if (text.trim()) return text
  }
  return ''
}

function parseJson(text) {
  if (!text) return null
  let s = text.trim()
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) s = f[1].trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1)
  try { return JSON.parse(s) } catch { return null }
}

// Heuristic question cue anywhere in (often unpunctuated) speech.
const QWORDS = /\b(what|why|how|can|could|do|does|did|is|are|was|were|when|where|who|whom|which|should|would|will|won't|need to|is there|are there|any update|explain|tell me|let me know)\b/i
function heuristic(chunk) {
  const t = chunk.trim()
  const isQ = t.includes('?') || QWORDS.test(t)
  return { is_question: isQ, question: isQ ? (t.endsWith('?') ? t : t + '?') : '', confidence: isQ ? 0.7 : 0.9 }
}

async function detect(chunk, context) {
  try {
    const r = parseJson(await complete(DETECT_SYSTEM, `Context:\n${context}\n\nChunk:\n${chunk}`, 500))
    if (r && typeof r.is_question === 'boolean') {
      return { is_question: r.is_question, question: String(r.question ?? '').trim() || chunk.trim(), confidence: Number(r.confidence ?? 0.75) }
    }
  } catch { /* fall through to heuristic */ }
  return heuristic(chunk)   // model returned empty/unparseable → don't miss the question
}
const answer = (question, context) => complete(ANSWER_SYSTEM, `Context:\n${context}\n\nQuestion:\n${question}`, 400)
async function summarize(transcript) {
  if (!transcript.trim()) return ''
  return (await complete(SUMMARIZE_SYSTEM, `Transcript:\n${transcript}`, 700)).trim()
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
function card(html) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; out.insertBefore(d, out.firstChild); return d }
const ctx = () => $('transcript').value.slice(-4000) || 'Live meeting.'

function renderQA(question) {
  const c = card(`<div class="q">❓ ${esc(question)}</div><div class="a muted">…thinking</div>`)
  const a = c.querySelector('.a')
  return (text) => { a.classList.remove('muted'); a.textContent = text || '(no answer)' }
}
function renderSummary(text) {
  card(`<div class="label">Meeting summary</div><div class="a">${esc(text || '(empty — try Summarize again)')}</div>`)
  return text
}

// Serialize host calls so live speech + clicks never overlap.
let chain = Promise.resolve()
const enqueue = (fn) => (chain = chain.then(fn).catch((e) => { card(`<div class="q">Error</div><div class="a">${esc(e.message)}</div>`) }))

// ── Persistent history via the host App storage (survives refresh) ───────────
const HKEY = 'session'
let history = []
function pushHistory(item) { history.push({ ...item, ts: Date.now() }); save() }
async function save() {
  try { await anna?.storage?.set({ key: HKEY, value: { transcript: $('transcript').value, items: history.slice(-200) } }) } catch { /* storage optional */ }
}
async function restore() {
  try {
    const got = await anna.storage.get({ key: HKEY })
    if (got?.exists && got.value) {
      if (got.value.transcript) $('transcript').value = got.value.transcript
      history = Array.isArray(got.value.items) ? got.value.items : []
      for (const it of history) {   // chronological → newest ends on top (cards insert at top)
        if (it.kind === 'qa') renderQA(it.q)(it.a)
        else if (it.kind === 'summary') renderSummary(it.text)
      }
    }
  } catch { /* storage optional */ }
}

// Live: detect a single utterance and, if it's a question, answer it.
function processLine(line) {
  const text = line.replace(/^[^:]{1,40}:\s*/, '').trim()
  if (!text) return
  const h = heuristic(text)   // instant detection — no extra host round-trip
  if (!h.is_question) return
  enqueue(async () => {
    const fill = renderQA(h.question); const a = await answer(h.question, ctx()); fill(a)
    pushHistory({ kind: 'qa', q: h.question, a })
  })
}

// Ask: answer a typed question directly (no detection gate).
function ask(question) {
  const q = question.trim(); if (!q) return
  enqueue(async () => {
    const fill = renderQA(q); const a = await answer(q, ctx()); fill(a)
    pushHistory({ kind: 'qa', q, a })
  })
}

function doSummarize() {
  if (!$('transcript').value.trim()) { card('<div class="a muted">Nothing to summarize yet — speak or paste a transcript first.</div>'); return }
  enqueue(async () => { const t = await summarize($('transcript').value); renderSummary(t); pushHistory({ kind: 'summary', text: t }) })
}

// Process the whole transcript box (typed/pasted), then summarize.
function run() {
  const lines = $('transcript').value.split('\n')
  for (const l of lines) processLine(l)
  doSummarize()
}

// ── Live transcription via the browser Web Speech API ────────────────────────
// Separate from Anna and key-free: the mic → text runs in the browser; only the
// reasoning (detect/answer/summarize) goes to anna.llm.complete().
const SR = window.SpeechRecognition || window.webkitSpeechRecognition
const micBtn = $('mic'), micStatus = $('micStatus')
let recog = null, listening = false
function setMic(msg, kind = '') { micStatus.style.display = 'inline-block'; micStatus.textContent = msg; micStatus.className = 'status ' + kind }
function appendLine(text) {
  const ta = $('transcript'), t = text.trim(); if (!t) return
  ta.value += (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + 'Speaker: ' + t
  ta.scrollTop = ta.scrollHeight
}
function toggleListen() {
  if (!SR) { setMic('Web Speech API not supported here — type or paste instead', 'err'); return }
  if (listening) { listening = false; recog && recog.stop(); return }
  recog = new SR(); recog.continuous = true; recog.interimResults = true; recog.lang = 'en-US'
  recog.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
      const t = e.results[i][0].transcript
      appendLine(t)
      if (anna) processLine(t)   // live: detect + answer this utterance immediately
    }
  }
  recog.onerror = (e) => {
    if (/not-allowed|service-not-allowed|audio-capture/.test(e.error)) {
      // fatal: permission / hardware → actually stop
      listening = false; micBtn.textContent = '🎤 Listen'
      setMic('mic: ' + e.error + ' (the app window needs microphone permission)', 'err')
    } else {
      // transient (no-speech / aborted / network) → stay live; onend restarts
      setMic('listening…', 'live')
    }
  }
  // Keep listening continuously until the user clicks Stop (Web Speech ends
  // sessions on its own after pauses / final results — we just restart).
  recog.onend = () => { if (listening) { try { recog.start() } catch { /* restarting */ } } else { micBtn.textContent = '🎤 Listen'; setMic('stopped') } }
  try { recog.start(); listening = true; micBtn.textContent = '⏹ Stop'; setMic('listening…', 'live') }
  catch (err) { setMic('could not start mic: ' + err.message, 'err') }
}
micBtn.addEventListener('click', toggleListen)

// History panel — shows everything saved (persisted across reloads).
function renderHistory() {
  const p = $('historyPanel')
  if (!history.length) { p.innerHTML = '<div class="card a muted">No history yet — ask a question or summarize.</div>'; return }
  p.innerHTML = '<div class="label" style="margin:6px 0">History (' + history.length + ')</div>' +
    history.slice().reverse().map((it) => {
      const t = it.ts ? new Date(it.ts).toLocaleString() : ''
      return it.kind === 'summary'
        ? `<div class="card"><div class="label">Summary · ${esc(t)}</div><div class="a">${esc(it.text)}</div></div>`
        : `<div class="card"><div class="q">❓ ${esc(it.q)}</div><div class="a">${esc(it.a)}</div><div class="label" style="margin-top:6px">${esc(t)}</div></div>`
    }).join('')
}
function toggleHistory() {
  const p = $('historyPanel'), showing = p.style.display !== 'none'
  if (showing) { p.style.display = 'none'; out.style.display = ''; $('history').textContent = 'History' }
  else { renderHistory(); p.style.display = 'block'; out.style.display = 'none'; $('history').textContent = 'Live' }
}

// Always-on UI wiring (works regardless of Anna; reasoning needs the host).
$('run').addEventListener('click', run)
$('summarize').addEventListener('click', doSummarize)
$('history').addEventListener('click', toggleHistory)
$('ask').addEventListener('click', () => { ask($('askInput').value); $('askInput').value = '' })
$('askInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { ask($('askInput').value); $('askInput').value = '' } })
$('clear').addEventListener('click', async () => {
  $('transcript').value = ''; out.innerHTML = ''; history = []
  $('historyPanel').style.display = 'none'; out.style.display = ''; $('history').textContent = 'History'
  try { await anna?.storage?.delete({ key: HKEY }) } catch { /* ignore */ }
})

// Connect to the Anna host.
const statusEl = $('status')
const reasoningBtns = ['run', 'summarize', 'ask']
try {
  anna = await AnnaAppRuntime.connect()
  statusEl.textContent = 'Connected · anna.llm.complete()'
  statusEl.className = 'status live'
  await restore()   // reload past transcript + Q&A/summary history
} catch (e) {
  statusEl.textContent = 'Anna runtime unavailable — run with `anna-app dev`'
  statusEl.className = 'status err'
  reasoningBtns.forEach((id) => { $(id).disabled = true })
}
