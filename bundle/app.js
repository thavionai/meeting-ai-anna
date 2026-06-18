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

const SAMPLE = `Alice: Thanks everyone for joining the Anna hackathon sync.
Bob: Can someone explain how this app works on Anna without using a personal API key?
Carol: We decided to keep BYOK mode and add Anna as a second provider.
Bob: Action item for me — record the 2-minute demo before Friday.
Alice: Carol will write the README comparing BYOK vs Anna mode.`
$('transcript').value = SAMPLE

const DETECT_SYSTEM =
  'You are Meeting AI. Decide whether this transcript chunk contains a real question a ' +
  'participant wants answered. Return JSON only: {"is_question":boolean,"question":string,"confidence":number}.'
const ANSWER_SYSTEM =
  'You are Meeting AI, a live meeting copilot. Answer the question using the meeting context. ' +
  'Be concise, professional, and speakable. Do not refer to yourself as an AI.'
const SUMMARIZE_SYSTEM =
  'You are Meeting AI. Summarize the meeting. Return JSON only: ' +
  '{"summary":string,"decisions":string[],"action_items":string[],"follow_up_email":string}.'

let anna = null

/** One LLM call through the Anna host. */
async function complete(system, user, maxTokens = 700) {
  const reply = await anna.llm.complete({ messages: [{ role: 'user', content: user }], systemPrompt: system, maxTokens })
  return reply?.content?.text ?? reply?.content?.[0]?.text ?? ''
}

function parseJson(text) {
  if (!text) return null
  let s = text.trim()
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) s = f[1].trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1)
  try { return JSON.parse(s) } catch { return null }
}

async function detect(chunk, context) {
  const r = parseJson(await complete(DETECT_SYSTEM, `Context:\n${context}\n\nChunk:\n${chunk}`, 200))
  if (r && typeof r.is_question === 'boolean') {
    return { is_question: r.is_question, question: String(r.question ?? ''), confidence: Number(r.confidence ?? 0.75) }
  }
  const isQ = /\?$/.test(chunk.trim()) || /^(what|why|how|can|could|do|does|is|are|should|would|when|where|who|explain|tell)/i.test(chunk.trim())
  return { is_question: isQ, question: isQ ? chunk.trim() : '', confidence: isQ ? 0.7 : 0.9 }
}
const answer = (question, context) => complete(ANSWER_SYSTEM, `Context:\n${context}\n\nQuestion:\n${question}`)
async function summarize(transcript) {
  return parseJson(await complete(SUMMARIZE_SYSTEM, `Transcript:\n${transcript}`, 900))
    || { summary: '', decisions: [], action_items: [], follow_up_email: '' }
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
function card(html) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; out.appendChild(d); return d }

async function run() {
  out.innerHTML = ''; $('run').disabled = true
  const transcript = $('transcript').value
  const context = 'Live meeting — Anna hackathon demo.'
  const lines = transcript.split('\n').map((l) => l.replace(/^[^:]{1,40}:\s*/, '').trim()).filter(Boolean)
  try {
    for (const line of lines) {
      const det = await detect(line, context)
      if (det.is_question && det.confidence >= 0.6) {
        const c = card(`<div class="q">❓ ${esc(det.question)}</div><div class="a">…thinking</div>`)
        c.querySelector('.a').textContent = await answer(det.question, context)
      }
    }
    card(`<div class="label">Meeting summary</div><pre>${esc(JSON.stringify(await summarize(transcript), null, 2))}</pre>`)
  } catch (e) {
    card(`<div class="q">Error</div><div class="a">${esc(e.message)}</div>`)
  } finally { $('run').disabled = false }
}

// Connect to the Anna host, then enable the UI.
const statusEl = $('status')
try {
  anna = await AnnaAppRuntime.connect()
  statusEl.textContent = 'Connected · anna.llm.complete()'
  statusEl.className = 'status live'
  $('run').addEventListener('click', run)
} catch (e) {
  statusEl.textContent = 'Anna runtime unavailable — run with `anna-app dev`'
  statusEl.className = 'status err'
  $('run').disabled = true
}
