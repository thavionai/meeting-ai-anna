// The three Executa tools Meeting AI exposes on Anna. Each takes the documented
// JSON input and returns the documented JSON output, routed through whichever
// provider is active (Anna or BYOK).

import { resolveProvider } from './providers/index.mjs'

export const TOOL_DEFS = [
  {
    name: 'detect_question',
    description: 'Determine whether a transcript chunk contains a real question.',
    input: { transcript_chunk: 'string', meeting_context: 'string' },
    output: { is_question: 'boolean', question: 'string', confidence: 'number' },
  },
  {
    name: 'answer_question',
    description: 'Answer a detected question using the meeting context.',
    input: { question: 'string', meeting_context: 'string' },
    output: { answer: 'string' },
  },
  {
    name: 'summarize_meeting',
    description: 'Summarize a full transcript into summary, decisions, action items and a follow-up email.',
    input: { transcript: 'string' },
    output: { summary: 'string', decisions: 'string[]', action_items: 'string[]', follow_up_email: 'string' },
  },
]

/** Invoke a tool by name with its args, using the active provider. */
export async function invokeTool(name, args = {}, providerName) {
  const provider = resolveProvider(providerName)
  const fn = provider[name]
  if (typeof fn !== 'function') {
    throw new Error(`Unknown tool "${name}". Available: ${TOOL_DEFS.map((t) => t.name).join(', ')}`)
  }
  const result = await fn(args)
  return { tool: name, provider: provider.id, result }
}

export function describe(providerName) {
  const provider = resolveProvider(providerName)
  return {
    app: 'Meeting AI',
    provider: { id: provider.id, label: provider.label, status: provider.ready },
    tools: TOOL_DEFS,
  }
}
