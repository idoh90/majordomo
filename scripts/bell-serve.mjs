#!/usr/bin/env node
/**
 * A local home for the Bell, with no Vercel in it.
 *
 * `vercel dev` is the faithful way to run `api/` — it is the same router and the
 * same runtime the deployment uses. It is also a CLI download, an account login,
 * a project link and a build step, and every one of those is a place to get
 * stuck before a single token has been measured. This file exists so B0's gate
 * can be reached without any of them.
 *
 * It is NOT a replacement for `vercel dev` and must not become one. It serves
 * exactly one route, does no routing, no static files, no framework. Anything
 * that passes here and fails on Vercel is a difference between this file and the
 * platform, and the platform is right. Use it to take the measurement; use
 * `vercel dev` before trusting anything about deployment behaviour.
 *
 * `api/bell.ts` is compiled on every start with the TypeScript already in this
 * project's devDependencies, and the output is thrown away. Deliberately: a
 * checked-in JavaScript twin of that file would drift from it within a week, and
 * a stale twin measuring the wrong code is worse than no measurement.
 *
 *   node scripts/bell-serve.mjs
 *
 * Reads .env.local itself. Real environment variables win, so a value set in the
 * shell overrides the file, the same order Vercel uses.
 */

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const PORT = Number(process.env.PORT ?? 3000)

/* -------------------------------------------------------------------------- */
/* environment                                                                */
/* -------------------------------------------------------------------------- */

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return 0
  let n = 0
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    // The shell wins. Matches Vercel, and means a one-off override does not
    // require editing a file that is meant to hold the durable answer.
    if (process.env[key] === undefined) {
      process.env[key] = value
      n++
    }
  }
  return n
}

loadEnvFile(path.join(ROOT, '.env.local'))

/**
 * Names and presence only — never a value. This is the one file in the project
 * that reads secrets off disk, so it is also the one that must never be the
 * reason a key ends up in a terminal, a screenshot or a pasted log.
 */
const has = (name) => (process.env[name] ?? '').trim() !== ''
const mark = (ok) => (ok ? 'set' : 'MISSING')

console.log('\n  The Bell — local runtime (no Vercel)\n')
console.log(`    ANTHROPIC_API_KEY          ${mark(has('ANTHROPIC_API_KEY'))}`)
console.log(`    SUPABASE_SERVICE_ROLE_KEY  ${mark(has('SUPABASE_SERVICE_ROLE_KEY'))}`)
console.log(
  `    Supabase URL + anon key    ${mark((has('SUPABASE_URL') && has('SUPABASE_ANON_KEY')) || (has('VITE_SUPABASE_URL') && has('VITE_SUPABASE_ANON_KEY')))}`,
)
console.log(
  `    BELL_ENABLED               ${process.env.BELL_ENABLED === '1' ? 'armed' : `"${process.env.BELL_ENABLED ?? ''}" — NOT ARMED, must be exactly 1`}`,
)
console.log(`    BELL_MODEL                 ${process.env.BELL_MODEL ?? 'claude-haiku-4-5 (default)'}`)
console.log(`    BELL_DAILY_FREE            ${process.env.BELL_DAILY_FREE ?? '5 (default)'}`)

/* -------------------------------------------------------------------------- */
/* compile api/bell.ts                                                        */
/* -------------------------------------------------------------------------- */

const require = createRequire(import.meta.url)

let ts
try {
  ts = require('typescript')
} catch {
  console.error('\n  typescript is not installed. Run `npm install` first.\n')
  process.exit(1)
}

const source = path.join(ROOT, 'api', 'bell.ts')
if (!fs.existsSync(source)) {
  console.error(`\n  Could not find ${source}\n`)
  process.exit(1)
}

// Inside node_modules so the compiled file resolves `@anthropic-ai/sdk` and
// `@supabase/supabase-js` by the ordinary walk-up, and so nothing lands anywhere
// git can see it.
const outDir = path.join(ROOT, 'node_modules', '.cache', 'bell-local')
const outFile = path.join(outDir, 'bell.mjs')
fs.mkdirSync(outDir, { recursive: true })

const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  fileName: 'bell.ts',
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    verbatimModuleSyntax: false,
  },
})
fs.writeFileSync(outFile, compiled.outputText)

let handler
try {
  ;({ default: handler } = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`))
} catch (e) {
  console.error(`\n  api/bell.ts failed to load: ${e?.message ?? e}\n`)
  process.exit(1)
}

if (typeof handler !== 'function') {
  console.error('\n  api/bell.ts has no default export function.\n')
  process.exit(1)
}

/* -------------------------------------------------------------------------- */
/* the bridge                                                                 */
/* -------------------------------------------------------------------------- */

/** Node's request object into the Web `Request` the handler is written against. */
function toRequest(req) {
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue
    // Hop-by-hop headers belong to this connection, not to the request.
    if (k === 'connection' || k === 'keep-alive' || k === 'transfer-encoding') continue
    for (const one of Array.isArray(v) ? v : [v]) headers.append(k, one)
  }

  const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url}`
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

  return new Promise((resolve, reject) => {
    if (!hasBody) return resolve(new Request(url, { method: req.method, headers }))
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('error', reject)
    req.on('end', () =>
      resolve(new Request(url, { method: req.method, headers, body: Buffer.concat(chunks) })),
    )
  })
}

const server = http.createServer(async (req, res) => {
  const started = Date.now()
  const label = `${req.method} ${req.url}`

  if (!req.url.startsWith('/api/bell')) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('This runtime serves /api/bell only. Use `npm run dev` for the app itself.\n')
    console.log(`    ${label} -> 404`)
    return
  }

  let response
  try {
    response = await handler(await toRequest(req))
  } catch (e) {
    console.error(`    ${label} -> the handler threw:`, e?.message ?? e)
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'the handler threw — see the server console' }))
    return
  }

  for (const [k, v] of response.headers) res.setHeader(k, v)
  res.writeHead(response.status)
  // Events must leave as they are produced; a buffered butler is a silent one.
  res.socket?.setNoDelay(true)

  if (!response.body) {
    res.end()
    console.log(`    ${label} -> ${response.status}  ${Date.now() - started}ms`)
    return
  }

  const reader = response.body.getReader()

  // The caller hanging up has to reach the handler, or its `cancel()` path — and
  // the meter write inside it — is never exercised here. This is the one piece
  // of platform behaviour worth imitating faithfully, because whether a hang-up
  // is metered is an open question about this endpoint.
  let hungUp = false
  res.on('close', () => {
    if (res.writableEnded) return
    hungUp = true
    reader.cancel(new Error('client hung up')).catch(() => {})
  })

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(Buffer.from(value))) await new Promise((r) => res.once('drain', r))
    }
  } catch {
    /* the consumer went away mid-stream — `close` above has already cancelled */
  } finally {
    if (!res.writableEnded) res.end()
    console.log(
      `    ${label} -> ${response.status}${hungUp ? ' (client hung up)' : ''}  ${Date.now() - started}ms`,
    )
  }
})

server.listen(PORT, () => {
  console.log(`\n  Ready — http://localhost:${PORT}/api/bell`)
  console.log(`  Leave this window open. Ctrl+C stops it.\n`)
})

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(
      `\n  Port ${PORT} is already taken — something else is running there, very likely` +
        `\n  a \`vercel dev\` from earlier. Close that window, or start this one with a` +
        `\n  different port:  set PORT=3001 && node scripts/bell-serve.mjs\n`,
    )
    process.exit(1)
  }
  throw e
})
