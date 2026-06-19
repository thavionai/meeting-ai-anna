// Simulates the Anna host driving the plugin: initialize → describe → invoke,
// and answers the plugin's reverse `sampling/createMessage` with canned text.
//   node test-roundtrip.mjs
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const p = spawn('node', [path.join(dir, 'plugin.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] })
const send = (o) => p.stdin.write(JSON.stringify(o) + '\n')
const waiters = new Map()

createInterface({ input: p.stdout }).on('line', (line) => {
  const s = line.trim(); if (!s) return
  let m; try { m = JSON.parse(s) } catch { return }
  if (m.method === 'sampling/createMessage') {           // plugin asked the host to run the model
    const txt = m.params?.messages?.[0]?.content?.text || ''
    let out = 'This is a sampled answer from the host.'
    if (/Chunk:/.test(txt)) out = '{"is_question": true, "question": "Do I need to submit the GitHub link today?", "confidence": 0.93}'
    else if (/Transcript:/.test(txt)) out = 'RECAP: The team agreed to ship.\nACTION ITEMS: Bob — record demo.\nFOLLOW-UP QUESTIONS / NEXT STEPS: dry run tomorrow.\nDECISIONS: ship with chat export.'
    send({ jsonrpc: '2.0', id: m.id, result: { role: 'assistant', content: { type: 'text', text: out }, model: 'test', usage: {} } })
  } else if (m.id != null && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id) }
})

const call = (id, method, params) => new Promise((res) => { waiters.set(id, res); send({ jsonrpc: '2.0', id, method, params }) })

const init = await call(1, 'initialize', { protocolVersion: '2.0', capabilities: { sampling: {} } })
console.log('initialize  →', JSON.stringify(init.result))
const desc = await call(2, 'describe', {})
console.log('describe    →', desc.result.tools.map((t) => t.name).join(', '))
const det = await call(3, 'invoke', { tool: 'detect_question', arguments: { transcript_chunk: 'do I need to submit the link today' }, context: { invoke_id: 'inv1' } })
console.log('detect      →', JSON.stringify(det.result))
const ans = await call(4, 'invoke', { tool: 'answer_question', arguments: { question: 'How does Anna work?' }, context: { invoke_id: 'inv2' } })
console.log('answer      →', JSON.stringify(ans.result))
const sum = await call(5, 'invoke', { tool: 'summarize_meeting', arguments: { transcript: 'Bob: I will record the demo. Decision: ship.' }, context: { invoke_id: 'inv3' } })
console.log('summarize   →', JSON.stringify(sum.result))
p.stdin.end()
setTimeout(() => process.exit(0), 100)
