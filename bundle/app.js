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
  'You are Meeting AI. Produce a clean meeting recap from the transcript with these labelled ' +
  'sections, in this order:\n' +
  'RECAP: 2-4 sentence summary of what happened.\n' +
  'ACTION ITEMS: bullet list, each as "Owner — task" (use the speaker/name if mentioned, else "Unassigned").\n' +
  'FOLLOW-UP QUESTIONS / NEXT STEPS: 2-4 bullets.\n' +
  'DECISIONS: bullet list, or "None".\n' +
  'If a section is empty write "None". Plain text / simple markdown — do NOT return JSON.'

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
  card(`<div class="label">Meeting recap — review, then Share</div><div class="a">${esc(text || '(empty — try Recap again)')}</div>`)
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
let histDays = 0   // 0 = all time
function renderHistory() {
  const p = $('historyPanel'), now = Date.now()
  const items = history.filter((it) => !histDays || (it.ts && now - it.ts <= histDays * 86400000))
  const picker = `<div class="row" style="margin:6px 0"><span class="muted" style="font-size:12px">Show last</span>` +
    `<select id="histDays" style="background:var(--panel);color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:4px 6px">` +
    `<option value="0">All time</option><option value="1">1 day</option><option value="7">7 days</option><option value="30">30 days</option></select>` +
    `<span class="muted" style="font-size:12px">${items.length} item(s)</span></div>`
  const body = items.length
    ? items.slice().reverse().map((it) => {
        const t = it.ts ? new Date(it.ts).toLocaleString() : ''
        return it.kind === 'summary'
          ? `<div class="card"><div class="label">Summary · ${esc(t)}</div><div class="a">${esc(it.text)}</div></div>`
          : `<div class="card"><div class="q">❓ ${esc(it.q)}</div><div class="a">${esc(it.a)}</div><div class="label" style="margin-top:6px">${esc(t)}</div></div>`
      }).join('')
    : '<div class="card a muted">No history in this range.</div>'
  p.innerHTML = picker + body
  const s = $('histDays'); if (s) { s.value = String(histDays); s.onchange = () => { histDays = Number(s.value); renderHistory() } }
}
function toggleHistory() {
  const p = $('historyPanel'), showing = p.style.display !== 'none'
  if (showing) { p.style.display = 'none'; out.style.display = ''; $('history').textContent = 'History' }
  else { renderHistory(); p.style.display = 'block'; out.style.display = 'none'; $('history').textContent = 'Live' }
}

// Email the conversation (browser mailto — opens the user's mail client).
function conversationText() {
  const parts = []
  if ($('transcript').value.trim()) parts.push('Transcript:\n' + $('transcript').value.trim() + '\n')
  for (const it of history) {
    parts.push(it.kind === 'summary' ? '--- Summary ---\n' + it.text : 'Q: ' + it.q + '\nA: ' + it.a)
  }
  return parts.join('\n\n')
}
function emailConversation() {
  const text = conversationText()
  if (!text.trim()) { setMic('Nothing to email yet', 'err'); return }
  const href = 'mailto:?subject=' + encodeURIComponent('Meeting AI — conversation') +
    '&body=' + encodeURIComponent(text.slice(0, 1800))
  const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'
  document.body.appendChild(a); a.click(); a.remove()
}

// ── Save / share the conversation ────────────────────────────────────────────
const stamp = () => new Date().toISOString().slice(0, 10)
// Downloads are blocked in the sandboxed iframe, so we save through the host:
// upload.inline persists the file and chat.append_artifact posts the link.
const b64utf8 = (s) => btoa(unescape(encodeURIComponent(s)))
async function exportFile(filename, mime, content_b64, label) {
  setMic('Saving ' + label + '…', 'live')
  try {
    const up = await anna.upload.inline({ filename, mime_type: mime, content_b64, purpose: 'user_artifact' })
    await anna.chat.append_artifact({ artifact: { kind: 'document', summary: `Meeting AI export: ${filename}`, payload_ref: up.download_url, data: { filename, download_url: up.download_url } } })
    setMic(`${label} saved → download link posted in the Anna chat`, 'live')
  } catch (e) {
    const needsGrant = /upload_grant|APP_NOT_GRANTED|403/i.test(e.message || '')
    try {   // fallback: post the conversation straight into the Anna chat
      await anna.chat.append_artifact({ artifact: { kind: 'document', summary: `Meeting AI — ${label} export`, data: { text: conversationText() } } })
      setMic(needsGrant
        ? `Posted the conversation to the Anna chat. (Downloadable files need the upload grant enabled on your account.)`
        : `Posted the conversation to the Anna chat instead.`, 'live')
    } catch (e2) { setMic('Export failed: ' + (e2.message || e2), 'err') }
  }
}
function saveTxt() { const t = conversationText(); if (t.trim()) exportFile(`meeting-ai-${stamp()}.txt`, 'text/plain', b64utf8(t), 'text') }
function saveDoc() {
  const t = conversationText(); if (!t.trim()) return
  const html = `<html xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset="utf-8"></head>` +
    `<body style="font-family:Calibri,Arial,sans-serif"><h2>Meeting AI — conversation</h2>` +
    `<pre style="white-space:pre-wrap;font-family:Calibri,Arial,sans-serif">${esc(t)}</pre></body></html>`
  exportFile(`meeting-ai-${stamp()}.doc`, 'application/msword', b64utf8(html), 'Word')
}
function savePdf() { const t = conversationText(); if (t.trim()) exportFile(`meeting-ai-${stamp()}.pdf`, 'application/pdf', btoa(buildPdf(t)), 'PDF') }

// Minimal, self-contained PDF (downloads/print are blocked, so we build bytes).
function buildPdf(text) {
  const wrap = (s, n) => {
    const out = []
    for (const raw of s.split('\n')) {
      let line = raw.replace(/[^\x20-\x7E]/g, '?')   // ASCII-only for byte-accurate /Length
      if (!line) { out.push(''); continue }
      while (line.length > n) { let cut = line.lastIndexOf(' ', n); if (cut < n * 0.5) cut = n; out.push(line.slice(0, cut)); line = line.slice(cut).replace(/^\s/, '') }
      out.push(line)
    }
    return out
  }
  const lines = wrap(text, 95), perPage = 52, pages = []
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage))
  if (!pages.length) pages.push([''])
  const escPdf = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const all = []
  all[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  all[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  let num = 4; const pageNums = []
  for (const pg of pages) {
    const cNum = num++, pNum = num++; pageNums.push(pNum)
    let stream = 'BT /F1 11 Tf 50 790 Td 13 TL\n'
    for (const ln of pg) stream += `(${escPdf(ln)}) Tj T*\n`
    stream += 'ET'
    all[cNum] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    all[pNum] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cNum} 0 R >>`
  }
  all[2] = `<< /Type /Pages /Kids [${pageNums.map((n) => n + ' 0 R').join(' ')}] /Count ${pageNums.length} >>`
  let pdf = '%PDF-1.4\n'; const offsets = []
  for (let i = 1; i < all.length; i++) { offsets[i] = pdf.length; pdf += `${i} 0 obj\n${all[i]}\nendobj\n` }
  const xref = pdf.length
  pdf += `xref\n0 ${all.length}\n0000000000 65535 f \n`
  for (let i = 1; i < all.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'
  pdf += `trailer\n<< /Size ${all.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return pdf
}
async function share() {
  const t = conversationText(); if (!t.trim()) return
  try {
    if (navigator.share) { await navigator.share({ title: 'Meeting AI', text: t }); return }
    await navigator.clipboard.writeText(t); setMic('Conversation copied to clipboard', 'live')
  } catch { try { await navigator.clipboard.writeText(t); setMic('Copied to clipboard', 'live') } catch { setMic('Share unavailable here', 'err') } }
}

// Minimize → compact bar (no true minimize in the window API; resize instead).
let compact = false
async function toggleMinimize() {
  try {
    compact = !compact
    await anna?.window?.resize(compact ? { w: 420, h: 180 } : { w: 880, h: 720 })
    $('min').textContent = compact ? 'Expand' : 'Minimize'
  } catch { /* window API may differ — ignore */ }
}

// Always-on UI wiring (works regardless of Anna; reasoning needs the host).
$('run').addEventListener('click', run)
$('summarize').addEventListener('click', doSummarize)
$('history').addEventListener('click', toggleHistory)
$('email').addEventListener('click', emailConversation)
$('min').addEventListener('click', toggleMinimize)
$('saveTxt').addEventListener('click', saveTxt)
$('saveDoc').addEventListener('click', saveDoc)
$('savePdf').addEventListener('click', savePdf)
$('share').addEventListener('click', share)
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
