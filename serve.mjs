#!/usr/bin/env node
// Tiny zero-dependency static server for the Anna App page (web/). Serves the
// repo root so the page's `../src/*.mjs` imports resolve. For local preview
// only — on Anna the page is hosted inside an Anna app.
//
//   npm run web   →   http://localhost:5174/web/

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 5174
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain' }

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0])
  if (rel === '/') rel = '/web/index.html'
  else if (rel.endsWith('/')) rel += 'index.html'
  const file = path.join(ROOT, rel)
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
}).listen(PORT, () => {
  console.log(`Anna App preview → http://localhost:${PORT}/web/`)
})
