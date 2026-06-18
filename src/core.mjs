// Shared implementation of the three reasoning capabilities. Providers differ
// only by the `backend` they pass:
//   • HTTP backend  (BYOK / Anna-as-OpenAI-compatible) → calls chatComplete()
//   • sampling backend (real Anna Executa) → calls backend.sampler() (host LLM)
//   • mock backend → deterministic offline result (zero-setup demos)

import { chatComplete, parseJsonReply } from './llm.mjs'
import { DETECT_SYSTEM, ANSWER_SYSTEM, SUMMARIZE_SYSTEM, detectUser, answerUser, summarizeUser } from './prompts.mjs'

/** Single completion entry — routes to host sampling or an HTTP endpoint. */
async function complete(backend, system, user, { maxTokens = 1024, json = false } = {}) {
  // Anna Executa host sampling: the tool has no key; the host runs the model.
  if (backend.sampler) return backend.sampler({ system, user, maxTokens })
  // OpenAI-compatible HTTP (BYOK, or Anna exposed as a REST endpoint).
  return chatComplete(backend, [{ role: 'system', content: system }, { role: 'user', content: user }], { maxTokens, json })
}

const QUESTION_WORDS = /^(what|why|how|can|could|do|does|did|is|are|was|were|when|where|who|which|should|would|will|may|might|explain|tell|describe|walk)/i

function heuristicQuestion(text = '') {
  const t = text.trim()
  if (!t) return { is_question: false, question: '', confidence: 0.95 }
  const hasMark = t.includes('?')
  const startsQ = QUESTION_WORDS.test(t)
  const is_question = hasMark || startsQ
  const confidence = hasMark && startsQ ? 0.9 : hasMark ? 0.8 : startsQ ? 0.65 : 0.9
  return { is_question, question: is_question ? t.replace(/\s+/g, ' ') : '', confidence }
}

// ── detect_question ──────────────────────────────────────────────────────────
export async function detectQuestion(backend, { transcript_chunk = '', meeting_context = '' } = {}) {
  if (backend.mock) return heuristicQuestion(transcript_chunk)
  try {
    const reply = await complete(backend, DETECT_SYSTEM, detectUser(transcript_chunk, meeting_context), { json: true, maxTokens: 200 })
    const parsed = parseJsonReply(reply)
    if (parsed && typeof parsed.is_question === 'boolean') {
      return {
        is_question: parsed.is_question,
        question: String(parsed.question ?? ''),
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.75,
      }
    }
  } catch (e) {
    if (process.env.DEBUG) console.error('[detect_question] falling back to heuristic:', e.message)
  }
  return heuristicQuestion(transcript_chunk)
}

// ── answer_question ──────────────────────────────────────────────────────────
export async function answerQuestion(backend, { question = '', meeting_context = '' } = {}) {
  if (backend.mock) {
    return {
      answer:
        `(${backend.label} mock) Here's a concise take on "${question.trim()}": ` +
        'based on the meeting context, give a direct, confident answer in 2–3 sentences. ' +
        'Configure a real provider (Anna sampling or BYOK) to get a live answer.',
    }
  }
  const answer = await complete(backend, ANSWER_SYSTEM, answerUser(question, meeting_context), { maxTokens: 700 })
  return { answer: answer.trim() }
}

// ── summarize_meeting ────────────────────────────────────────────────────────
export async function summarizeMeeting(backend, { transcript = '' } = {}) {
  if (backend.mock) {
    const firstLine = (transcript.split(/[.!?\n]/)[0] || '').trim()
    return {
      summary: firstLine ? `${firstLine}.` : 'No transcript provided.',
      decisions: [],
      action_items: [],
      follow_up_email: `Hi team,\n\nQuick recap: ${firstLine || 'see notes'}.\n\n(${backend.label} mock — configure a real provider for a full summary.)\n\nThanks!`,
    }
  }
  const reply = await complete(backend, SUMMARIZE_SYSTEM, summarizeUser(transcript), { json: true, maxTokens: 900 })
  const parsed = parseJsonReply(reply) || {}
  return {
    summary: String(parsed.summary ?? ''),
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    action_items: Array.isArray(parsed.action_items) ? parsed.action_items : [],
    follow_up_email: String(parsed.follow_up_email ?? ''),
  }
}
