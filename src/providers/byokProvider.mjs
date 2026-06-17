// BYOK provider — wraps the existing "bring your own key" model. Uses the user's
// own OpenAI-compatible key; nothing routes through Anna.

import { byokBackend } from '../config.mjs'
import * as core from '../core.mjs'

export function createByokProvider() {
  const backend = byokBackend()
  return {
    id: 'byok',
    label: backend.label,
    ready: backend.mock ? 'mock (no key configured)' : `live → ${backend.baseURL} (${backend.model})`,
    detect_question: (args) => core.detectQuestion(backend, args),
    answer_question: (args) => core.answerQuestion(backend, args),
    summarize_meeting: (args) => core.summarizeMeeting(backend, args),
  }
}
