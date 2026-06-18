// Meeting AI as an Anna App. The page reuses the same reasoning tools as the
// CLI, but the backend is the Anna App Runtime — every LLM call is
// anna.llm.complete(), so there is no API key in this page at all.

import * as core from '../src/core.mjs'
import { createAnnaBackend } from '../src/anna/runtime.mjs'

const $ = (id) => document.getElementById(id)
const out = $('out')

const SAMPLE = `Alice: Thanks everyone for joining the Anna hackathon sync.
Bob: Can someone explain how this app works on Anna without using a personal API key?
Carol: We decided to keep BYOK mode and add Anna as a second provider.
Bob: Action item for me — record the 2-minute demo before Friday.
Alice: Carol will write the README comparing BYOK vs Anna mode.`

$('transcript').value = SAMPLE

// One integration point: the Anna runtime backend (anna.llm.complete under the hood).
const backend = createAnnaBackend()
const statusEl = $('status')
if (backend.mock) {
  statusEl.textContent = 'Anna runtime not detected — mock mode'
  statusEl.className = 'status mock'
  $('hint').textContent = 'Open inside an Anna app for live anna.llm.complete()'
} else {
  statusEl.textContent = 'Connected to Anna · anna.llm.complete()'
  statusEl.className = 'status live'
}

function card(html) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; out.appendChild(d); return d }
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

async function run() {
  out.innerHTML = ''
  $('run').disabled = true
  const transcript = $('transcript').value
  const context = 'Live meeting — Anna hackathon demo.'
  const lines = transcript.split('\n').map((l) => l.replace(/^[^:]{1,40}:\s*/, '').trim()).filter(Boolean)

  try {
    for (const line of lines) {
      const det = await core.detectQuestion(backend, { transcript_chunk: line, meeting_context: context })
      if (det.is_question && det.confidence >= 0.6) {
        const c = card(`<div class="q">❓ ${esc(det.question)}</div><div class="a">…thinking</div>`)
        const ans = await core.answerQuestion(backend, { question: det.question, meeting_context: context })
        c.querySelector('.a').textContent = ans.answer
      }
    }
    const sum = await core.summarizeMeeting(backend, { transcript })
    card(
      `<div class="label">Meeting summary</div><pre>${esc(JSON.stringify(sum, null, 2))}</pre>`,
    )
  } catch (e) {
    card(`<div class="q">Error</div><div class="a">${esc(e.message)}</div>`)
  } finally {
    $('run').disabled = false
  }
}

$('run').addEventListener('click', run)
