// Anna provider — routes reasoning through the Anna App Runtime
// (anna.llm.complete). The hackathon headline: Meeting AI works on Anna with no
// personal OpenAI/Anthropic key — the model stays on the Anna Host.
//
// The single integration point is src/anna/runtime.mjs (createAnnaBackend),
// which calls `anna.llm.complete()` per Anna's App Runtime SDK. Outside an Anna
// app (e.g. the Node CLI) there's no AnnaAppRuntime, so it falls back to mock.

import { createAnnaBackend } from '../anna/runtime.mjs'
import * as core from '../core.mjs'

export function createAnnaProvider(opts = {}) {
  const backend = createAnnaBackend(opts)
  return {
    id: 'anna',
    label: backend.label,
    ready: backend.mock ? 'mock (no AnnaAppRuntime — run inside an Anna app)' : 'live → anna.llm.complete()',
    detect_question: (args) => core.detectQuestion(backend, args),
    answer_question: (args) => core.answerQuestion(backend, args),
    summarize_meeting: (args) => core.summarizeMeeting(backend, args),
  }
}
