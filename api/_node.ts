/**
 * The Node bridge — how a web handler in this directory reaches the socket.
 *
 * Underscore-prefixed: Vercel does not route this file, it only bundles it into
 * the two that import it.
 *
 * WHY IT EXISTS, and it is not a style preference. Vercel's Node runtime accepts
 * two shapes, and only two: a DEFAULT export called with Node's `(req, res)`
 * pair, or NAMED per-method exports (`export function GET(request: Request)`)
 * written against the web standard. A default export that takes a `Request` and
 * returns a `Response` is neither. The runtime calls it with `(req, res)`
 * regardless, notes that the default export returned a Response, discards it —
 * and nothing is ever written to the socket. The caller waits with zero bytes
 * until the platform kills the invocation, which on this project read as
 * `/api/bell` and `/api/google` hanging for 300 seconds and answering 504.
 * Every request, including a HEAD that did no work at all.
 *
 * Both files stay written against `Request`/`Response` — that is the shape the
 * handlers want to be, it is what `scripts/bell-serve.mjs` runs, and it is what
 * an edge runtime would take unchanged. This file is the only thing that knows
 * the platform's calling convention, and it is deliberately the only thing:
 * a bridge in two copies is a bridge that drifts.
 *
 * Its second job is a deadline. A handler that never resolves must still answer,
 * because a hang is the one failure a caller cannot tell from a slow success —
 * the whole reason the outage above cost what it did. Past the deadline this
 * writes a 504 itself rather than letting the platform's ceiling do it minutes
 * later.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** what the files in this directory export: the request in, the reply out */
export type WebHandler = (req: Request) => Promise<Response>

/**
 * Headers that describe THIS connection rather than the request, and must not be
 * copied onto a new one. `content-length` and `content-encoding` go too: the body
 * below may have been parsed and re-serialised by the platform, so the numbers
 * that arrived no longer describe the bytes we hand on. `Request` recomputes both.
 * 
 * Forbidden headers per the Fetch spec that would cause `new Request()` to throw:
 * `host`, `connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `te`, 
 * `trailer`, and any header starting with `proxy-` or `sec-`.
 */
const DROP = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'te',
  'trailer',
  'proxy-authenticate',
  'proxy-authorization',
  'content-length',
  'content-encoding',
])

/** A body larger than this is refused rather than buffered. */
const MAX_BODY_BYTES = 1_000_000

const headersOf = (req: IncomingMessage): Headers => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || DROP.has(name)) continue
    // Also drop any header starting with 'sec-' or 'proxy-' (forbidden by Fetch)
    if (name.startsWith('sec-') || name.startsWith('proxy-')) continue
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one)
  }
  return headers
}

/**
 * The absolute URL the handler will read.
 *
 * Node hands over a path; `new URL()` needs an origin. The forwarded pair is
 * what Vercel's proxy sets, and it is only ever used to parse the query string
 * and the path — nothing in either handler trusts this host for anything. The
 * OAuth callback's redirect_uri comes from the signed state, not from here,
 * which is what keeps a spoofed Host header uninteresting.
 */
const urlOf = (req: IncomingMessage): string => {
  const first = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : (value ?? '')).split(',')[0].trim()

  // Vercel's proxy always sets the forwarded pair. Falling back to the socket
  // rather than to a constant keeps `scripts/bell-serve.mjs` honest, where the
  // connection really is plaintext.
  const encrypted = (req.socket as { encrypted?: boolean } | undefined)?.encrypted === true
  const proto = first(req.headers['x-forwarded-proto']) || (encrypted ? 'https' : 'http')
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host) || 'localhost'
  return `${proto}://${host}${req.url ?? '/'}`
}

/**
 * The body, however the platform decided to give it to us.
 *
 * `@vercel/node` parses a JSON body before the handler is called and exposes it
 * as `req.body` — which means the stream is already at its end. Waiting on
 * `end` in that state is a wait for an event that has already fired: a hang
 * inside the very bridge written to stop one. So the parsed copy is used when
 * it is there, and the stream is only read when it genuinely has not been.
 */
const bodyOf = async (req: IncomingMessage): Promise<Buffer | undefined> => {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined

  const parsed = (req as IncomingMessage & { body?: unknown }).body
  if (parsed !== undefined && parsed !== null) {
    if (Buffer.isBuffer(parsed)) return parsed
    if (typeof parsed === 'string') return Buffer.from(parsed)
    return Buffer.from(JSON.stringify(parsed))
  }

  if (req.readableEnded) return undefined

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', reject)
    req.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/** one readable line, and never the internal reason */
const refuse = (res: ServerResponse, status: number, error: string): void => {
  if (res.writableEnded || res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ error }))
}

const sendHead = (res: ServerResponse, response: Response): void => {
  for (const [name, value] of response.headers) {
    if (name === 'set-cookie') continue
    res.setHeader(name, value)
  }
  // Iterating a `Headers` folds repeated set-cookies into one comma-joined line,
  // which is wrong for every cookie after the first. Neither handler sets one
  // today; this is here so that the day one does, it is not a debugging session.
  const jar = response.headers as Headers & { getSetCookie?: () => string[] }
  const cookies = typeof jar.getSetCookie === 'function' ? jar.getSetCookie() : []
  if (cookies.length > 0) res.setHeader('set-cookie', cookies)

  res.writeHead(response.status)
  // The Bell streams. Events have to leave as they are produced — a buffered
  // butler is a silent one.
  res.flushHeaders?.()
  res.socket?.setNoDelay(true)
}

/**
 * Write the reply out, honouring backpressure and the caller hanging up.
 *
 * The hang-up path is load-bearing rather than tidy: cancelling the reader is
 * what runs the Bell's `cancel()`, and that is where a claimed slot is either
 * costed or handed back. It is awaited before this resolves so the platform
 * cannot reclaim the invocation with that write still in flight.
 */
const sendBody = async (res: ServerResponse, response: Response, head: boolean): Promise<void> => {
  // A HEAD, a 204 and a 304 all carry no body by definition. Writing one anyway
  // is how a health probe turns into a protocol error.
  if (head || response.status === 204 || response.status === 304 || !response.body) {
    await response.body?.cancel()
    res.end()
    return
  }

  const reader = response.body.getReader()
  let hangUp: Promise<void> | null = null

  res.on('close', () => {
    if (res.writableEnded) return
    hangUp = reader.cancel(new Error('the caller hung up')).catch(() => {})
  })

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => res.once('drain', resolve))
      }
    }
  } catch {
    /* the consumer went away mid-stream — `close` above has already cancelled */
  } finally {
    await hangUp
    if (!res.writableEnded) res.end()
  }
}

/** the sentinel a deadline wins with — a Response can never be this */
const LATE = Symbol('late')

/**
 * Wrap a web handler in the signature the platform actually calls.
 *
 * `deadlineMs` is the wait for the RESPONSE, not for the whole reply: the Bell's
 * stream is handed over the moment its headers are known and may then run for as
 * long as `maxDuration` allows. Keep it comfortably inside that ceiling, so a
 * stalled dependency fails as a fact rather than as a platform timeout.
 */
export const nodeHandler =
  (handler: WebHandler, { deadlineMs }: { deadlineMs: number }) =>
  async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // Defensive: ensure we have valid request/response objects
    if (!req || !res) {
      console.error('[api] Invalid req/res objects:', { req: !!req, res: !!res })
      if (res?.writeHead && !res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/plain' })
        res.end('Invalid request/response objects')
      }
      return
    }
    
    const head = req.method === 'HEAD'
    let timer: ReturnType<typeof setTimeout> | undefined

    try {
      const request = new Request(urlOf(req), {
        method: req.method,
        headers: headersOf(req),
        body: await bodyOf(req),
      })

      const running = handler(request)
      const deadline = new Promise<typeof LATE>((resolve) => {
        timer = setTimeout(() => resolve(LATE), deadlineMs)
      })

      const response = await Promise.race([running, deadline])

      if (response === LATE) {
        console.error(`[api] ${req.method} ${req.url} produced no response in ${deadlineMs}ms`)
        refuse(res, 504, 'timeout')
        // Not awaited: the caller already has an answer and the invocation is
        // free to end. Cancelling stops a handler that is still paying an
        // upstream for a reply nobody will now read.
        void running.then((late) => late.body?.cancel()).catch(() => {})
        return
      }

      sendHead(res, response)
      await sendBody(res, response, head)
    } catch (e) {
      // The reason goes to the function log; the wire gets a status and nothing
      // that describes this house's insides.
      console.error(`[api] ${req.method} ${req.url} threw:`, e instanceof Error ? e.message : e)
      refuse(res, 500, 'server')
      if (!res.writableEnded) res.end()
    } finally {
      clearTimeout(timer)
    }
  }
