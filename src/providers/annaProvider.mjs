// Anna provider — routes reasoning through the Anna Platform's hosted LLM /
// Sampling API instead of a personal key. This is the hackathon's headline:
// Meeting AI works on Anna without anyone's OpenAI/Anthropic key.
//
// The actual network call lives in src/llm.mjs (chatComplete) and the endpoint
// shape in src/config.mjs (annaBackend). Those are the only spots to adjust if
// Anna's Sampling API differs from the OpenAI-compatible default.

import { annaBackend } from '../config.mjs'
import * as core from '../core.mjs'

export function createAnnaProvider() {
  const backend = annaBackend()
  return {
    id: 'anna',
    label: backend.label,
    ready: backend.mock ? 'mock (ANNA_API_URL/TOKEN not set)' : `live → ${backend.baseURL} (${backend.model})`,
    detect_question: (args) => core.detectQuestion(backend, args),
    answer_question: (args) => core.answerQuestion(backend, args),
    summarize_meeting: (args) => core.summarizeMeeting(backend, args),
  }
}
