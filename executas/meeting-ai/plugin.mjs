#!/usr/bin/env node
// Meeting AI — Anna Executa plugin.
//
// Raw JSON-RPC 2.0 over stdio (line-delimited), per Anna's Executa protocol:
//   host → plugin : initialize → describe → invoke (→ health) → shutdown
//   plugin → host : reverse RPC `sampling/createMessage` (the host runs the LLM)
//
// Reasoning uses host SAMPLING — there is NO API key in this plugin. The host
// authorizes each call with the per-invoke `sampling_token` in context.
//
// ⚠️ NEVER console.log — stdout is the protocol channel. Log with console.error.

import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'

const log = (...a) => console.error('[meeting-ai]', ...a)
const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
const reply = (id, payload) => send({ jsonrpc: '2.0', id, ...payload })

// ── Reverse RPC: ask the host to run the model (valid during an invoke) ───────
const pending = new Map()
function sample({ system, user, maxTokens = 700, invokeId, timeoutMs = 30000 }) {
  const id = randomUUID()
  send({
    jsonrpc: '2.0', id, method: 'sampling/createMessage',
    params: {
      messages: [{ role: 'user', content: { type: 'text', text: user } }],
      systemPrompt: system,
      maxTokens: Math.min(maxTokens, 8192),
      temperature: 0.3,
      modelPreferences: { hints: [{ name: 'claude-sonnet' }], speedPriority: 0.7, intelligencePriority: 0.3 },
      includeContext: 'none',
      metadata: invokeId ? { executa_invoke_id: invokeId } : undefined,
    },
  })
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { pending.delete(id); reject(new Error('sampling timed out')) }, timeoutMs)
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v) }, reject: (e) => { clearTimeout(t); reject(e) } })
  })
}

// ── Prompts (mirror the Anna App) ────────────────────────────────────────────
const DETECT_SYSTEM =
  'You are Meeting AI. The chunk is live speech-to-text — possibly unpunctuated. If ANY part is a ' +
  'real question a participant wants answered, set is_question true and put the cleaned question ' +
  '(ending in "?") in "question". Greetings/small talk are not questions. ' +
  'Return JSON only: {"is_question":boolean,"question":string,"confidence":number}.'
const ANSWER_SYSTEM =
  'You are Meeting AI, a live meeting copilot. Answer the question using the meeting context. ' +
  'Be concise, professional, and speakable. Do not refer to yourself as an AI.'
const SUMMARIZE_SYSTEM =
  'You are Meeting AI. Produce a clean meeting recap with labelled sections in order: ' +
  'RECAP (2-4 sentences); ACTION ITEMS (each "Owner — task", "Unassigned" if no owner); ' +
  'FOLLOW-UP QUESTIONS / NEXT STEPS (2-4 bullets); DECISIONS (or "None"). Plain text, not JSON.'

function parseJson(text) {
  if (!text) return null
  let s = text.trim()
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i); if (f) s = f[1].trim()
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) s = s.slice(a, b + 1)
  try { return JSON.parse(s) } catch { return null }
}
const QWORDS = /\b(what|why|how|can|could|do|does|did|is|are|should|would|will|need to|is there|when|where|who|which|explain|tell me)\b/i
const heuristic = (t = '') => ({ is_question: t.includes('?') || QWORDS.test(t), question: t.trim().endsWith('?') ? t.trim() : t.trim() + '?', confidence: 0.7 })

// ── Tools ─────────────────────────────────────────────────────────────────────
async function detect_question({ transcript_chunk = '', meeting_context = '' }, invokeId) {
  try {
    const r = parseJson(await sample({ system: DETECT_SYSTEM, user: `Context:\n${meeting_context}\n\nChunk:\n${transcript_chunk}`, maxTokens: 200, invokeId }))
    if (r && typeof r.is_question === 'boolean') return { is_question: r.is_question, question: String(r.question || ''), confidence: Number(r.confidence ?? 0.75) }
  } catch (e) { log('detect sampling failed:', e.message) }
  const h = heuristic(transcript_chunk)
  return { is_question: h.is_question, question: h.is_question ? h.question : '', confidence: h.is_question ? 0.7 : 0.9 }
}
async function answer_question({ question = '', meeting_context = '' }, invokeId) {
  const text = await sample({ system: ANSWER_SYSTEM, user: `Context:\n${meeting_context}\n\nQuestion:\n${question}`, maxTokens: 500, invokeId })
  return { answer: (text || '').trim() }
}
async function summarize_meeting({ transcript = '' }, invokeId) {
  const text = await sample({ system: SUMMARIZE_SYSTEM, user: `Transcript:\n${transcript}`, maxTokens: 800, invokeId })
  return { recap: (text || '').trim() }
}

const TOOLS = { detect_question, answer_question, summarize_meeting }

const MANIFEST = {
  name: 'meeting-ai',
  display_name: 'Meeting AI',
  version: '0.1.0',
  description: 'Detects questions in a meeting transcript, answers them, and writes a recap with action items and next steps — using the host LLM (no API key).',
  category: 'productivity',
  tools: [
    { name: 'detect_question', description: 'Decide whether a transcript chunk contains a real question.', parameters: { type: 'object', properties: { transcript_chunk: { type: 'string' }, meeting_context: { type: 'string' } }, required: ['transcript_chunk'] } },
    { name: 'answer_question', description: 'Answer a question using the meeting context.', parameters: { type: 'object', properties: { question: { type: 'string' }, meeting_context: { type: 'string' } }, required: ['question'] } },
    { name: 'summarize_meeting', description: 'Recap a transcript: summary, action items + owners, next steps, decisions.', parameters: { type: 'object', properties: { transcript: { type: 'string' } }, required: ['transcript'] } },
  ],
}

async function handleInvoke(id, params = {}) {
  const fn = TOOLS[params.tool]
  if (!fn) { reply(id, { result: { success: false, error: `unknown tool: ${params.tool}` } }); return }
  const started = Date.now()
  try {
    const data = await fn(params.arguments || {}, params.context?.invoke_id)
    reply(id, { result: { success: true, data, duration_ms: Date.now() - started } })
  } catch (e) {
    reply(id, { result: { success: false, error: String(e?.message || e) } })
  }
}

// ── stdin loop — keep reading until EOF; never exit after one response ─────────
createInterface({ input: process.stdin }).on('line', (line) => {
  const s = line.trim(); if (!s) return
  let msg; try { msg = JSON.parse(s) } catch { return }
  if (msg.method) {
    switch (msg.method) {
      case 'initialize': reply(msg.id, { result: { protocolVersion: '2.0', capabilities: { sampling: {} } } }); break
      case 'describe': reply(msg.id, { result: MANIFEST }); break
      case 'health': reply(msg.id, { result: { status: 'ready' } }); break
      case 'invoke': handleInvoke(msg.id, msg.params); break
      case 'shutdown': reply(msg.id, { result: { ok: true } }); break
      default: if (msg.id != null) reply(msg.id, { error: { code: -32601, message: `method not found: ${msg.method}` } })
    }
  } else if (msg.id != null && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id)
    if (msg.error) reject(new Error(msg.error.message || 'sampling error'))
    else resolve(msg.result?.content?.text ?? msg.result?.content?.[0]?.text ?? '')
  }
}).on('close', () => process.exit(0))

log('ready (stdio JSON-RPC, sampling)')
