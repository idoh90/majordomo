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
 *
 * Its third job is the socket, and it falls here because nothing else can reach
 * it. A handler is handed a `Request` and hands back a `Response`; it cannot see
 * that the caller has hung up, cannot tell a socket that has stopped taking
 * bytes from one that has gone away, and does not know what ends up in the log
 * store. So this file owns all three: it tells the handler when the caller left
 * (the `AbortController` in `nodeHandler`), it waits on backpressure without
 * waiting forever (`drained`), and it decides what a log line is allowed to say
 * (`pathOf`). None of the three is a correctness bug inside a handler. Each of
 * them costs the household either billed minutes or a live secret.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** what the files in this directory export: the request in, the reply out */
export type WebHandler = (req: Request) => Promise<Response>

/**
 * Headers that describe THIS connection rather than the request, and must not be
 * copied onto a new one. `content-length` and `content-encoding` go too: the body
 * below may have been parsed and re-serialised by the platform, so the numbers
 * that arrived no longer describe the bytes we hand on. `Request` recomputes both.
 */
const DROP = new Set([
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
 * The part of the address a log line may repeat, which is the path and nothing
 * else.
 *
 * Node hands over a path with its query still attached, and on `/api/google`
 * that query IS the OAuth callback — a live authorization code and a `state`
 * still inside the ten minutes it was signed for. The two `console.error` lines
 * below fire on exactly the two occasions that matter most (a handler past its
 * deadline, a handler that threw), so a slow upstream on the consent walk wrote
 * a usable code and a usable state into Vercel's log store, where they sit far
 * longer than either was meant to live and are readable by anyone with
 * dashboard access. No log line here has ever needed the query to be useful, so
 * no log line gets it. Splitting on the `?` is enough: a query can only follow
 * one, and a fragment never reaches a server.
 */
const pathOf = (req: IncomingMessage): string => (req.url ?? '/').split('?')[0]

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
 * Wait for the socket to take more — or for it to admit it never will.
 *
 * `drain` is a promise the connection only keeps while it is alive. A caller who
 * hangs up with our buffer full never sends one, so waiting on `drain` alone
 * parks the invocation until the platform's ceiling kills it: sixty seconds of
 * billed silence on behalf of a reader who left. `close` and `error` therefore
 * end the wait as well, and all three listeners come off whichever of them wins
 * — the Bell's stream can meet backpressure hundreds of times in one reply, and
 * a listener left behind on each of them is a leak that announces itself as a
 * MaxListeners warning long after the cause.
 *
 * The early return is that same hang one tick earlier, and it is not belt and
 * braces. `write()` on a socket that is already gone returns false too, and by
 * then `close` has fired: a listener registered at that point is waiting on an
 * event that is in the past, which is precisely the wait this function exists to
 * end. Resolving rather than rejecting is deliberate — the reader has already
 * been cancelled by the hang-up path below, so the next `read()` reports done
 * and the loop leaves through its ordinary door.
 */
const drained = (res: ServerResponse): Promise<void> =>
  new Promise<void>((resolve) => {
    if (res.destroyed || res.writableEnded) return resolve()

    const settle = (): void => {
      res.off('drain', settle)
      res.off('close', settle)
      res.off('error', settle)
      resolve()
    }

    res.once('drain', settle)
    res.once('close', settle)
    res.once('error', settle)
  })

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

  const hungUp = (): void => {
    if (res.writableEnded || hangUp) return
    hangUp = reader.cancel(new Error('the caller hung up')).catch(() => {})
  }

  res.on('close', hungUp)
  // `close` can already be in the past. A caller is free to leave while the
  // handler is still deciding what to answer, and a listener armed here would
  // then be waiting on an event that has been and gone — the same blind spot as
  // `drained`'s, and the same cure. It matters more here than it reads: without
  // it the loop below finds every write refused, never waits, and empties the
  // whole of the Bell's stream at full speed into a socket that is not there,
  // paying an upstream for every token of it. Better to notice at the door.
  if (res.destroyed) hungUp()

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!res.write(Buffer.from(value))) await drained(res)
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
    const head = req.method === 'HEAD'
    let timer: ReturnType<typeof setTimeout> | undefined

    // The caller's departure, made visible to the handler.
    //
    // Both files already compose `init.signal` into every upstream fetch they
    // make; until now there was simply nothing to compose, because the `Request`
    // carried no signal at all. So a browser that closed its tab stayed
    // invisible for the entire window before a response came back — the six
    // second registry round-trip included — and the house went on paying an
    // upstream, and in the Bell's case a household slot, for a reply nobody was
    // ever going to read.
    //
    // `close` fires on a healthy finished response too, so it is guarded the way
    // `sendBody`'s own hang-up is: `writableEnded` is set the moment we call
    // `end()`, and is only still false here if the socket went first. By the
    // time a reply is streaming the handler has long since returned, so a
    // spurious abort would mostly go unobserved — but a signal that cries abort
    // over every successful request is a signal nobody can trust on the one
    // occasion it means it.
    const leaving = new AbortController()
    res.on('close', () => {
      if (res.writableEnded) return
      leaving.abort(new Error('the caller hung up'))
    })

    try {
      // Armed before the body is read, on purpose: a caller can leave while we
      // are still buffering, and that is the longest anyone waits here. Handing
      // `Request` a signal that has ALREADY aborted does not throw — it arrives
      // aborted, which is exactly what the handler should be told before it
      // spends anything.
      const request = new Request(urlOf(req), {
        method: req.method,
        headers: headersOf(req),
        body: await bodyOf(req),
        signal: leaving.signal,
      })

      const running = handler(request)
      const deadline = new Promise<typeof LATE>((resolve) => {
        timer = setTimeout(() => resolve(LATE), deadlineMs)
      })

      const response = await Promise.race([running, deadline])

      if (response === LATE) {
        console.error(`[api] ${req.method} ${pathOf(req)} produced no response in ${deadlineMs}ms`)
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
      console.error(`[api] ${req.method} ${pathOf(req)} threw:`, e instanceof Error ? e.message : e)
      refuse(res, 500, 'server')
      if (!res.writableEnded) res.end()
    } finally {
      clearTimeout(timer)
    }
  }
