#!/usr/bin/env node
// Local Executa dev-runner for the Meeting AI Anna tool.
//
// Mirrors the Anna CLI workflow so you can develop/demo without the platform:
//   node cli.mjs --describe
//   node cli.mjs --invoke detect_question  --args '{"transcript_chunk":"...","meeting_context":"..."}'
//   node cli.mjs --invoke answer_question  --args '{"question":"...","meeting_context":"..."}'
//   node cli.mjs --invoke summarize_meeting --args '{"transcript":"..."}'
//
// Provider: AI_PROVIDER=anna|byok env var, or --provider anna|byok.
// On the real platform these map to:
//   anna-app executa dev --describe
//   anna-app executa dev --invoke <tool> --args '{...}'

import { invokeTool, describe } from './src/tools.mjs'

function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--describe') out.describe = true
    else if (a === '--invoke') out.invoke = argv[++i]
    else if (a === '--args') out.args = argv[++i]
    else if (a === '--provider') out.provider = argv[++i]
    else out._.push(a)
  }
  return out
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.describe || (!opts.invoke && opts._.length === 0)) {
    console.log(JSON.stringify(describe(opts.provider), null, 2))
    return
  }

  let args = {}
  if (opts.args) {
    try {
      args = JSON.parse(opts.args)
    } catch {
      console.error('Invalid --args JSON. Example: --args \'{"transcript_chunk":"Can you explain the plan?"}\'')
      process.exit(1)
    }
  }

  const result = await invokeTool(opts.invoke, args, opts.provider)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => {
  console.error('Error:', e.message)
  process.exit(1)
})
