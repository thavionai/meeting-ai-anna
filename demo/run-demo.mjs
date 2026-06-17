#!/usr/bin/env node
// End-to-end demo: feed the sample transcript through the active provider,
// chunk by chunk → detect questions → answer them → summarize the meeting.
//
//   AI_PROVIDER=anna node demo/run-demo.mjs
//   AI_PROVIDER=byok node demo/run-demo.mjs
//
// Runs in mock mode with zero credentials so the flow is always demonstrable.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProvider } from '../src/providers/index.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const transcript = fs.readFileSync(path.join(here, 'sample-transcript.txt'), 'utf8')
const provider = resolveProvider()

console.log(`\n=== Meeting AI on Anna — demo (provider: ${provider.id} · ${provider.ready}) ===\n`)

const lines = transcript.split('\n').map((l) => l.replace(/^\[\d{2}:\d{2}\]\s*[^:]+:\s*/, '').trim()).filter(Boolean)
const context = 'Anna hackathon sync — demoing Meeting AI on Anna without a personal API key.'

for (const line of lines) {
  const det = await provider.detect_question({ transcript_chunk: line, meeting_context: context })
  if (det.is_question && det.confidence >= 0.6) {
    console.log(`❓ Question detected (conf ${det.confidence}): ${det.question}`)
    const ans = await provider.answer_question({ question: det.question, meeting_context: context })
    console.log(`💬 Answer: ${ans.answer}\n`)
  }
}

console.log('--- Meeting summary ---')
const summary = await provider.summarize_meeting({ transcript })
console.log(JSON.stringify(summary, null, 2))
