/**
 * The Google Calendar bridge — custody only.
 *
 * The estate's second secret-holder (the Bell was the first, and its rules
 * apply verbatim): this endpoint exists because an OAuth client secret and a
 * refresh token cannot live in a browser, and for no other reason. Every piece
 * of actual calendar work — reading Google's events, writing the estate's,
 * deciding what maps to what — happens on the CLIENT, which talks to Google's
 * API directly with the short-lived access tokens this file mints. The server
 * stays what it has always been in this project: dumb, opaque, replaceable.
 *
 * What it does, and nothing more:
 *   POST {action:'begin'}       → the Google consent URL, with a signed state
 *   GET  ?code&state            → Google's redirect: exchange the code, keep
 *                                 the refresh token, bounce back to the app
 *   POST {action:'status'}      → is this household connected (no Google call)
 *   POST {action:'token'}       → a fresh access token from the refresh grant
 *   POST {action:'calendar'}    → remember the app-created calendar's id
 *   POST {action:'disconnect'}  → revoke at Google, forget the row
 *
 * Errors are a CLOSED machine vocabulary (`{ error: code }`) — the words live
 * in `voice.calendars.errors`, client-side, where every string in this app
 * lives. The server never phrases anything.
 *
 * Server-side environment (Vercel project settings — never in git, never in
 * the client bundle, never VITE_-prefixed):
 *   GOOGLE_CLIENT_ID           required
 *   GOOGLE_CLIENT_SECRET       required — also keys the state signature
 *   SUPABASE_SERVICE_ROLE_KEY  required — gcal_accounts is service_role-only
 *   GCAL_ENABLED               required, "1" to arm. Absent = every call refused.
 * The Supabase URL and anon key are reused from the client build's VITE_ pair.
 *
 * The state parameter is the callback's whole authentication: a 10-minute
 * HMAC over {user, origin, expiry}, keyed by a hash of the client secret with
 * a domain-separation prefix — so there is no nonce table to migrate and no
 * extra secret to provision, and rotating the client secret only invalidates
 * states that were already mid-flight.
 */

import { createClient } from '@supabase/supabase-js'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { nodeHandler } from './_node.js'

/* -------------------------------------------------------------------------- */
/* environment                                                                */
/* -------------------------------------------------------------------------- */

const env = (name: string, fallback = ''): string => process.env[name]?.trim() ?? fallback

/** URL and key resolve as a PAIR, never independently — bell.ts's reasoning. */
const [SUPABASE_URL, SUPABASE_ANON_KEY] =
  env('SUPABASE_URL') !== '' && env('SUPABASE_ANON_KEY') !== ''
    ? [env('SUPABASE_URL'), env('SUPABASE_ANON_KEY')]
    : [env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY')]

const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')

/** where a caller with no usable Origin is sent back to */
const CANONICAL = 'https://majordomocal.com'

/**
 * The origins this door answers to — bell.ts's list plus one: `vercel dev`
 * serves app and functions together on localhost:3000, and that is the only
 * way to walk the OAuth loop locally (5173 never serves `api/`). An absent
 * Origin is admitted for the same reason as the Bell's: curl and server-side
 * callers send none, and a browser cannot avoid sending one on a POST.
 * THIS LIST HAS TO GROW WHENEVER A DOMAIN DOES — and so does the redirect-URI
 * list in the Google Cloud console, which is the half an env var cannot fix.
 */
const ALLOWED_ORIGINS = new Set([
  CANONICAL,
  'https://majordomo-cyan.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
])

/** what this app may touch, and nothing more: full command of secondary
 *  calendars IT created (where the estate's bookings go), and a read of the
 *  user's own calendars (what the Manor mirrors). It can never edit or delete
 *  an event the user made in their own calendar. */
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.events.readonly',
].join(' ')

/** nothing here may wait forever — bell.ts's reasoning, same magnitudes */
const withTimeout =
  (ms: number): typeof fetch =>
  (input, init) => {
    const deadline = AbortSignal.timeout(ms)
    const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline
    return fetch(input, { ...init, signal })
  }

/**
 * A `token` action is the longest walk in this file — the session, the row, the
 * refresh grant, sometimes a rotation write — and all of it has to finish inside
 * the deadline the bridge holds this handler to. Each wait is short enough that
 * four of them still leave room.
 */
const REGISTRY_TIMEOUT_MS = 6_000
const GOOGLE_TIMEOUT_MS = 8_000

/** an OAuth exchange is two sequential upstream calls at most */
export const maxDuration = 30

/** how long a consent walk may take between `begin` and the callback */
const STATE_TTL_MS = 10 * 60_000

/* -------------------------------------------------------------------------- */
/* replies                                                                    */
/* -------------------------------------------------------------------------- */

/** a refusal is one readable JSON line; the client maps codes to voice */
const fail = (status: number, code: string): Response =>
  new Response(JSON.stringify({ error: code }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const ok = (body: object): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

/** the callback's replies are navigations, not JSON — the browser is mid-walk */
const bounce = (site: string, outcome: 'connected' | 'denied' | 'error'): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `${site}/?gcal=${outcome}`, 'cache-control': 'no-store' },
  })

/* -------------------------------------------------------------------------- */
/* the signed state                                                           */
/* -------------------------------------------------------------------------- */

type State = { u: string; o: string; e: number }

/** domain-separated from the client secret: no second secret to provision */
const stateKey = (): Buffer =>
  createHash('sha256').update(`majordomo-gcal-state:${env('GOOGLE_CLIENT_SECRET')}`).digest()

const signState = (s: State): string => {
  const body = Buffer.from(JSON.stringify(s)).toString('base64url')
  const mac = createHmac('sha256', stateKey()).update(body).digest('base64url')
  return `${body}.${mac}`
}

const readState = (raw: string): State | null => {
  const [body, mac] = raw.split('.')
  if (!body || !mac) return null
  const expect = createHmac('sha256', stateKey()).update(body).digest()
  let got: Buffer
  try {
    got = Buffer.from(mac, 'base64url')
  } catch {
    return null
  }
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return null
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as State
    if (typeof s.u !== 'string' || typeof s.o !== 'string' || typeof s.e !== 'number') return null
    if (Date.now() > s.e) return null
    if (!ALLOWED_ORIGINS.has(s.o)) return null
    return s
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* the door — verbatim from bell.ts, and the same seam                        */
/* -------------------------------------------------------------------------- */

type Door =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'unreachable' }

async function verifyUser(token: string): Promise<Door> {
  const auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: withTimeout(REGISTRY_TIMEOUT_MS) },
  })
  try {
    const { data, error } = await auth.auth.getUser(token)
    if (data?.user && !error) return { ok: true, id: data.user.id }
    const status = (error as { status?: number } | null)?.status
    return { ok: false, reason: status ? 'invalid' : 'unreachable' }
  } catch {
    return { ok: false, reason: 'unreachable' }
  }
}

/* -------------------------------------------------------------------------- */
/* Google's two endpoints                                                     */
/* -------------------------------------------------------------------------- */

type TokenGrant = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  id_token?: string
  error?: string
}

const googleToken = async (form: Record<string, string>): Promise<TokenGrant | null> => {
  try {
    const res = await withTimeout(GOOGLE_TIMEOUT_MS)('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    })
    return (await res.json()) as TokenGrant
  } catch {
    return null
  }
}

/** the id_token rode Google's own TLS response — decoded, not re-verified */
const emailFromIdToken = (idToken: unknown): string | null => {
  if (typeof idToken !== 'string') return null
  const parts = idToken.split('.')
  if (parts.length < 2) return null
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      email?: unknown
    }
    return typeof claims.email === 'string' ? claims.email : null
  } catch {
    return null
  }
}

/** the service_role client — gcal_accounts' only door */
const table = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: withTimeout(REGISTRY_TIMEOUT_MS) },
  }).from('gcal_accounts')

type Row = {
  user_id: string
  google_email: string | null
  refresh_token: string
  calendar_id: string | null
}

/* -------------------------------------------------------------------------- */
/* the callback (GET)                                                         */
/* -------------------------------------------------------------------------- */

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const state = readState(url.searchParams.get('state') ?? '')
  // no verifiable state = no knowable origin; the canonical door takes the news
  if (!state) return bounce(CANONICAL, 'error')
  if (url.searchParams.get('error')) return bounce(state.o, 'denied')

  const code = url.searchParams.get('code')
  if (!code) return bounce(state.o, 'error')

  const grant = await googleToken({
    grant_type: 'authorization_code',
    code,
    client_id: env('GOOGLE_CLIENT_ID'),
    client_secret: env('GOOGLE_CLIENT_SECRET'),
    // must byte-match what `begin` sent, or Google refuses the exchange
    redirect_uri: `${state.o}/api/google`,
  })
  // `prompt=consent` guarantees a refresh token on every walk; missing one
  // means the exchange itself went sideways, and a retry re-issues it
  if (!grant?.access_token || !grant.refresh_token) return bounce(state.o, 'error')

  const { error } = await table().upsert(
    {
      user_id: state.u,
      google_email: emailFromIdToken(grant.id_token),
      refresh_token: grant.refresh_token,
      // calendar_id deliberately absent: a reconnect must not forget the
      // calendar the account already has (upsert only touches named columns)
    },
    { onConflict: 'user_id' },
  )
  // the refresh token is lost with the row unwritten — acceptable: reconnect
  // walks the same door and Google mints another
  if (error) return bounce(state.o, 'error')

  return bounce(state.o, 'connected')
}

/* -------------------------------------------------------------------------- */
/* the handler                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The endpoint itself, written against the web standard — `Request` in,
 * `Response` out. It is NOT the default export: Vercel's Node runtime calls a default
 * export with Node's `(req, res)` pair and discards a `Response` handed back to
 * it, which is a hang rather than an error. `./_node` reconciles the two shapes,
 * and the bottom of this file is where that happens.
 */
async function serve(req: Request): Promise<Response> {
  // A HEAD is a health probe. Answered first and answered empty: a consent walk
  // must never be started by one, and a probe has no business learning whether
  // this door is armed.
  if (req.method === 'HEAD') {
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  }

  // The kill switch, and it defaults to OFF — deploying this file must not by
  // itself open a door into anyone's calendar. A GET mid-walk while disarmed
  // is bounced rather than fed JSON: the caller is a browser being navigated.
  if (env('GCAL_ENABLED') !== '1') {
    return req.method === 'GET' ? bounce(CANONICAL, 'error') : fail(503, 'off')
  }

  if (
    !env('GOOGLE_CLIENT_ID') ||
    !env('GOOGLE_CLIENT_SECRET') ||
    !SERVICE_ROLE_KEY ||
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY
  ) {
    return req.method === 'GET' ? bounce(CANONICAL, 'error') : fail(500, 'misconfigured')
  }

  // Google's redirect is a top-level navigation: no Origin worth reading, no
  // bearer to present — the HMAC state IS its authentication.
  if (req.method === 'GET') return callback(req)
  if (req.method !== 'POST') return fail(405, 'method')

  const origin = req.headers.get('origin')
  if (origin !== null && !ALLOWED_ORIGINS.has(origin)) return fail(403, 'origin')

  const bearer = req.headers.get('authorization') ?? ''
  const token = bearer.toLowerCase().startsWith('bearer ') ? bearer.slice(7).trim() : ''
  if (!token) return fail(401, 'signin')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, 'bad')
  }
  if (typeof body !== 'object' || body === null) return fail(400, 'bad')
  const action = (body as { action?: unknown }).action
  if (
    action !== 'begin' &&
    action !== 'status' &&
    action !== 'token' &&
    action !== 'calendar' &&
    action !== 'disconnect'
  ) {
    return fail(400, 'bad')
  }

  const door = await verifyUser(token)
  if (!door.ok) {
    return door.reason === 'unreachable' ? fail(503, 'unreachable') : fail(401, 'invalid')
  }
  const userId = door.id

  /* ------------------------------------------------------------- begin */

  if (action === 'begin') {
    // the origin the walk should come home to: the caller's own when it is
    // one of ours (vercel dev included), the canonical door otherwise
    const site = origin && ALLOWED_ORIGINS.has(origin) ? origin : CANONICAL
    const hint = (body as { email?: unknown }).email
    const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    auth.searchParams.set('client_id', env('GOOGLE_CLIENT_ID'))
    auth.searchParams.set('redirect_uri', `${site}/api/google`)
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('scope', SCOPES)
    // offline + consent: the pair that makes Google mint a refresh token on
    // every walk, not only the first — the price is one more consent screen
    auth.searchParams.set('access_type', 'offline')
    auth.searchParams.set('prompt', 'consent')
    auth.searchParams.set('include_granted_scopes', 'true')
    if (typeof hint === 'string' && hint.includes('@') && hint.length <= 320) {
      auth.searchParams.set('login_hint', hint)
    }
    auth.searchParams.set('state', signState({ u: userId, o: site, e: Date.now() + STATE_TTL_MS }))
    return ok({ url: auth.toString() })
  }

  /* the remaining actions all read the household's row first */

  const { data, error } = await table()
    .select('user_id, google_email, refresh_token, calendar_id')
    .eq('user_id', userId)
    .maybeSingle<Row>()
  if (error) return fail(503, 'unreachable')

  /* ------------------------------------------------------------ status */

  if (action === 'status') {
    return ok({
      connected: data !== null,
      email: data?.google_email ?? null,
      calendarId: data?.calendar_id ?? null,
    })
  }

  if (!data) return fail(404, 'notConnected')

  /* ------------------------------------------------------------- token */

  if (action === 'token') {
    const grant = await googleToken({
      grant_type: 'refresh_token',
      refresh_token: data.refresh_token,
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
    })
    if (!grant) return fail(502, 'google')
    if (!grant.access_token) {
      // a dead grant (revoked at Google, or Testing mode's 7-day expiry) is a
      // different sentence from "Google is down": the row is KEPT so the sheet
      // can still say whose connection lapsed, and the client flips to its
      // reconnect state rather than its retry state
      return grant.error === 'invalid_grant' ? fail(401, 'reconnect') : fail(502, 'google')
    }
    // Google occasionally rotates the refresh token inside a grant — keep it
    if (grant.refresh_token && grant.refresh_token !== data.refresh_token) {
      await table().update({ refresh_token: grant.refresh_token }).eq('user_id', userId)
    }
    return ok({
      accessToken: grant.access_token,
      // minted here, spent client-side: an absolute instant survives clock
      // skew better than a relative countdown re-interpreted later
      expiresAt: Date.now() + (grant.expires_in ?? 3600) * 1000,
      email: data.google_email,
      calendarId: data.calendar_id,
    })
  }

  /* ---------------------------------------------------------- calendar */

  if (action === 'calendar') {
    const id = (body as { id?: unknown }).id
    const previous = (body as { previous?: unknown }).previous
    if (typeof id !== 'string' || id.trim() === '' || id.length > 1024) return fail(400, 'bad')
    // First writer wins; a later writer only replaces the id it believed was
    // current (the re-create path after the user deleted the calendar at
    // Google). A device that lost the race reads the winner back and adopts
    // it — the one calendar per account rule is kept HERE, not on devices.
    const current = data.calendar_id
    const mayWrite =
      current === null || current === id || (typeof previous === 'string' && previous === current)
    if (mayWrite && current !== id) {
      const { error: writeError } = await table().update({ calendar_id: id }).eq('user_id', userId)
      if (writeError) return fail(503, 'unreachable')
      return ok({ ok: true, calendarId: id })
    }
    return ok({ ok: true, calendarId: mayWrite ? id : current })
  }

  /* -------------------------------------------------------- disconnect */

  // revocation is best-effort: Google being down must not leave the row —
  // the deletion is what disconnect MEANS, revocation is courtesy to the
  // user's Google security page
  try {
    await withTimeout(GOOGLE_TIMEOUT_MS)('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: data.refresh_token }).toString(),
    })
  } catch {
    /* the row deletion below is the source of truth */
  }
  const { error: dropError } = await table().delete().eq('user_id', userId)
  if (dropError) return fail(503, 'unreachable')
  return ok({ ok: true })
}

/**
 * What the platform actually calls.
 *
 * 20 seconds is a net, not a budget: every wait inside is bounded already, and
 * the longest possible walk through them stays under it. Past that the caller
 * gets a 504 from this house rather than silence until `maxDuration`.
 */
export default nodeHandler(serve, { deadlineMs: 20_000 })
