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
 *   GET  ?code&state            → Google's redirect: exchange the code, PARK
 *                                 the refresh token, hand the browser a secret
 *   POST {action:'claim'}       → spend that secret; file the parked grant
 *                                 under the session that presents it
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
 *   SUPABASE_SERVICE_ROLE_KEY  required — both gcal tables are service_role-only
 *   GCAL_ENABLED               required, "1" to arm. Absent = every call refused.
 * The Supabase URL and anon key are reused from the client build's VITE_ pair.
 *
 * THE HANDOFF — and why the signed state is not, and never was, an identity.
 *
 * This file used to treat the state parameter as the callback's whole
 * authentication: a 10-minute HMAC over {user, origin, expiry}, and the
 * callback wrote Google's refresh token straight into `gcal_accounts` under
 * the user id it read back out of there. The signature was sound. The
 * conclusion drawn from it was wrong, and it was wrong in the way that costs
 * somebody their calendar: a state proves who STARTED the walk, and in the
 * attack that is the attacker. Sign up, ask this endpoint for a consent URL,
 * send the genuine accounts.google.com link to somebody else. They see
 * Google's own screen on Google's own domain, approve with their own account —
 * and their refresh token is filed under the sender's user id, who can then
 * read every calendar they have for as long as Google honours the grant. The
 * one identity that mattered was never in the walk at all: the browser that
 * FINISHED it.
 *
 * So the callback no longer knows, or asks, whose connection this is. It parks
 * the refresh token in `gcal_pending` (0007), addressed by the sha256 of a
 * secret minted right there with `randomBytes`, and hands the plaintext secret
 * to the only party that could possibly be entitled to it — the browser it is
 * redirecting. That browser comes back with `{action:'claim'}` and its OWN
 * bearer token, and the grant is filed under the id that token verifies to.
 * The secret is deliberately absent from the state: a state is base64url and
 * whoever started the walk can read every field in it, so a secret minted at
 * `begin` would be a secret the attacker could spend first.
 *
 * The pending row is single-use and short-lived. The claim DELETEs and RETURNs
 * in one statement, so two claims racing on the same secret cannot both come
 * away with the grant, and a link that leaks is a link worth one attempt inside
 * ten minutes rather than an open door for everyone who clicks it.
 *
 * PKCE rides along, derived rather than stored: the verifier is an HMAC over
 * the state under the same key that signs it, so the callback recomputes it
 * from what Google hands back and there is still no table to migrate for it.
 * The state's own MAC travels in the URL, so the verifier is a DIFFERENT PRF
 * output over the same bytes — see `codeVerifier`, where that is the whole of
 * its safety.
 *
 * The key under all of it is still a hash of the client secret with a
 * domain-separation prefix: no extra secret to provision, and rotating the
 * client secret only invalidates walks that were already mid-flight.
 */

import { createClient } from '@supabase/supabase-js'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
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

/**
 * How long the finished walk's claim secret is worth anything.
 *
 * The walk is over by the time one is minted and the app is already loading, so
 * this is not a wait — it is room for a browser that came home signed OUT to
 * sign in and spend it. The row is single-use besides, so the width of the
 * window only ever matters once per walk.
 */
const CLAIM_TTL_MS = 10 * 60_000

/** 256 bits from the system CSPRNG — 43 base64url characters, derived from nothing */
const CLAIM_BYTES = 32

/**
 * Shape, not authentication. The secret authenticates itself by matching a
 * parked row; this only keeps a stray megabyte of nonsense from being carried
 * to the registry and hashed.
 */
const CLAIM_SHAPE = /^[A-Za-z0-9_-]{32,128}$/

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

/**
 * The callback's replies are navigations, not JSON — the browser is mid-walk.
 * There is no longer a 'connected' outcome here, and its absence is the point:
 * this endpoint cannot connect anything on a browser's say-so, because the
 * browser Google redirects is not necessarily the household that asked.
 */
const bounce = (site: string, outcome: 'denied' | 'error'): Response =>
  new Response(null, {
    status: 302,
    headers: { location: `${site}/?gcal=${outcome}`, 'cache-control': 'no-store' },
  })

/**
 * The handoff: the one reply that carries a claim secret, to the one browser
 * that could be entitled to it.
 *
 * `pending` rather than `connected` because nothing is connected yet — the app
 * has to trade `n` for the grant under its own session. The client strips both
 * params before anything else runs (the `?join` rule, in `app/gcal/init.ts`),
 * so the secret does not survive a reload or a copied address; that, and the
 * row being single-use, is what keeps a shared browser history from being a
 * credential.
 */
const handoff = (site: string, secret: string): Response =>
  new Response(null, {
    status: 302,
    headers: {
      location: `${site}/?gcal=pending&n=${encodeURIComponent(secret)}`,
      'cache-control': 'no-store',
    },
  })

/* -------------------------------------------------------------------------- */
/* the signed state                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the state has to prove, now that it no longer pretends to know whose
 * walk this is: that WE issued it, for an origin of ours, within the last ten
 * minutes. There is no user id in here any more — see the handoff paragraph at
 * the top of this file for what carrying one cost.
 *
 * `s` is a per-walk salt. Its only job is to make the PKCE verifier derived
 * below unique to this walk rather than to this millisecond: two `begin` calls
 * landing in the same tick would otherwise share a state body, and a verifier
 * is not meant to be reused.
 */
type State = { o: string; e: number; s: string }

/** domain-separated from the client secret: no second secret to provision */
const stateKey = (): Buffer =>
  createHash('sha256').update(`majordomo-gcal-state:${env('GOOGLE_CLIENT_SECRET')}`).digest()

const signState = (s: State): string => {
  const body = Buffer.from(JSON.stringify(s)).toString('base64url')
  const mac = createHmac('sha256', stateKey()).update(body).digest('base64url')
  return `${body}.${mac}`
}

const readState = (raw: string): State | null => {
  // Exactly two parts, so a state that verifies here is byte-identical to the
  // one `begin` signed. That matters beyond tidiness: the PKCE verifier is
  // derived from the WHOLE string, so a tolerated suffix would verify happily
  // and then derive a verifier Google refuses at the exchange.
  const parts = raw.split('.')
  if (parts.length !== 2) return null
  const [body, mac] = parts
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
    if (typeof s.o !== 'string' || typeof s.e !== 'number' || typeof s.s !== 'string') return null
    if (Date.now() > s.e) return null
    if (!ALLOWED_ORIGINS.has(s.o)) return null
    return s
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* PKCE, without a table                                                      */
/* -------------------------------------------------------------------------- */

/**
 * RFC 7636 §4.1: 43–128 characters from [A-Za-z0-9-._~]. The base64url of a
 * SHA-256 HMAC is exactly 43 characters drawn from a subset of that alphabet,
 * so `codeVerifier` satisfies the rule by construction — this is that rule
 * written somewhere it can actually be checked rather than in a comment nobody
 * runs. `begin` refuses to hand out a consent URL if it ever stops holding.
 */
const VERIFIER_RULE = /^[A-Za-z0-9\-._~]{43,128}$/

/**
 * The verifier for this walk, derived rather than remembered.
 *
 * Nothing is stored between `begin` and the callback: the state is the only
 * thing that travels, and the key that signs it can also derive a secret from
 * it. THE DOMAIN PREFIX IS THE WHOLE OF THE SAFETY HERE. The state's own MAC is
 * HMAC(key, body) and it rides in the URL where the walk's initiator reads it;
 * a verifier computed the same way would therefore be a value the initiator
 * already holds. Prefixed, it is a different PRF output over the same bytes,
 * and no amount of holding the MAC produces it without the key.
 *
 * PKCE is defence in depth here rather than the load-bearing fix — Google
 * requires the client secret from a web client, and the code goes to our own
 * redirect_uri, so an intercepted code was never enough on its own. It closes
 * the interception case anyway, and it is one line to close.
 */
const codeVerifier = (state: string): string =>
  createHmac('sha256', stateKey()).update(`majordomo-gcal-pkce:${state}`).digest('base64url')

/** S256: what Google is told to expect back, and never the verifier itself */
const codeChallenge = (verifier: string): string =>
  createHash('sha256').update(verifier).digest('base64url')

/* -------------------------------------------------------------------------- */
/* the claim secret                                                           */
/* -------------------------------------------------------------------------- */

/**
 * What the registry is allowed to hold: the shadow of a claim secret, never the
 * secret. A read of `gcal_pending` — a leaked backup, a mistaken grant, an
 * evening in the SQL editor — must not yield anything that can be spent.
 */
const claimHash = (secret: string): string => createHash('sha256').update(secret).digest('hex')

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

/** the service_role client — both credential tables' only door */
const service = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: withTimeout(REGISTRY_TIMEOUT_MS) },
  })

const table = () => service().from('gcal_accounts')

/** where a finished walk's grant waits for the browser that finished it (0007) */
const pending = () => service().from('gcal_pending')

type Row = {
  user_id: string
  google_email: string | null
  refresh_token: string
  calendar_id: string | null
}

type PendingRow = {
  refresh_token: string
  google_email: string | null
  expires_at: string
}

/* -------------------------------------------------------------------------- */
/* the callback (GET)                                                         */
/* -------------------------------------------------------------------------- */

async function callback(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const raw = url.searchParams.get('state') ?? ''
  const state = readState(raw)
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
    // re-derived from the state Google just handed back, never remembered
    code_verifier: codeVerifier(raw),
    // must byte-match what `begin` sent, or Google refuses the exchange
    redirect_uri: `${state.o}/api/google`,
  })
  // `prompt=consent` guarantees a refresh token on every walk; missing one
  // means the exchange itself went sideways, and a retry re-issues it
  if (!grant?.access_token || !grant.refresh_token) return bounce(state.o, 'error')

  // MINTED HERE, AND NOWHERE ELSE. Not in `begin`, not in the state, not from
  // anything either of them holds: the state is legible to whoever started the
  // walk, so a secret they could read or derive would be a secret they could
  // spend before the person who actually approved at Google. This is the one
  // value that separates the two, and only the browser being redirected below
  // ever sees it in the clear.
  const secret = randomBytes(CLAIM_BYTES).toString('base64url')

  const [parked] = await Promise.allSettled([
    pending().insert({
      claim_hash: claimHash(secret),
      refresh_token: grant.refresh_token,
      google_email: emailFromIdToken(grant.id_token),
      expires_at: new Date(Date.now() + CLAIM_TTL_MS).toISOString(),
    }),
    // The sweep. An expired pending row is not litter — it is a LIVE Google
    // refresh token sitting in a table, for a walk nobody ever came back to
    // finish, and it would sit there forever because no other code path has a
    // reason to look at it. This is the only moment anything routinely touches
    // this table, so it is where the sweeping happens. It runs ALONGSIDE the
    // insert rather than before it because the callback's budget is the
    // bridge's 20 s deadline and it has already spent up to eight of them at
    // Google; two registry round-trips in sequence would put the walk on the
    // line. Nothing races: the row being written expires in the future, so a
    // sweep of the past cannot take it.
    pending().delete().lt('expires_at', new Date().toISOString()),
  ])
  // the refresh token is lost with the row unwritten — acceptable: reconnect
  // walks the same door and Google mints another
  if (parked.status !== 'fulfilled' || parked.value.error) return bounce(state.o, 'error')

  return handoff(state.o, secret)
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

  // Google's redirect is a top-level navigation: no Origin worth reading and no
  // bearer to present, so the HMAC state is all it can be asked for. Note what
  // that state is now allowed to mean: this walk came from us, for an origin of
  // ours, recently. It says nothing about WHO, and the callback asks it nothing
  // of the sort — that question is answered at `claim`, with a bearer token.
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
    action !== 'claim' &&
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

  // The session that reaches `begin` is a DOORMAN and nothing more: it keeps
  // strangers from generating consent URLs on this house's client id. It is not
  // an identity, and nothing downstream may treat it as one — whose connection
  // this becomes is decided at `claim`, by the session that presents the
  // secret. That is why `userId` is unused for the length of this block.
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
    const state = signState({
      o: site,
      e: Date.now() + STATE_TTL_MS,
      s: randomBytes(9).toString('base64url'),
    })
    const verifier = codeVerifier(state)
    // by construction this cannot fail; if it ever does, the walk is refused
    // rather than started with a challenge Google will reject at the exchange
    if (!VERIFIER_RULE.test(verifier)) return fail(500, 'misconfigured')
    auth.searchParams.set('code_challenge', codeChallenge(verifier))
    auth.searchParams.set('code_challenge_method', 'S256')
    auth.searchParams.set('state', state)
    return ok({ url: auth.toString() })
  }

  /* ------------------------------------------------------------- claim */

  // Deliberately ABOVE the household read below: a claim is the write that
  // creates that row, and it has its own reason to be economical — the bridge's
  // deadline has already paid for `verifyUser`, and the two registry calls here
  // are what is left of it.
  if (action === 'claim') {
    const n = (body as { n?: unknown }).n
    if (typeof n !== 'string' || !CLAIM_SHAPE.test(n)) return fail(400, 'bad')

    // Single use, and ATOMICALLY so — this is OAUTH-03's fix. The old walk
    // consumed nothing at all: a state stayed good for its whole ten minutes,
    // so one crafted link harvested everybody who clicked it inside the window.
    // Here the DELETE and the read of what was deleted are one statement, so
    // the row is locked for the whole of it: of two claims racing on the same
    // secret, one comes away with the grant and the other comes away with
    // nothing. There is no read-then-delete for them to interleave inside.
    const { data: parked, error: claimError } = await pending()
      .delete()
      .eq('claim_hash', claimHash(n))
      .select('refresh_token, google_email, expires_at')
      .maybeSingle<PendingRow>()
    if (claimError) return fail(503, 'unreachable')
    // absent, already spent, or too late. One code, because they are one
    // sentence to the reader and one remedy: walk the consent again. The row is
    // gone either way — an expired grant must not survive being asked for.
    if (!parked || Date.parse(parked.expires_at) <= Date.now()) return fail(404, 'expired')

    const { data: row, error: writeError } = await table()
      .upsert(
        {
          // THE VERIFIED SESSION'S id, from the bearer this request carried —
          // never a user id read out of anything that travelled through Google.
          user_id: userId,
          google_email: parked.google_email,
          refresh_token: parked.refresh_token,
          // calendar_id deliberately absent: a reconnect must not forget the
          // calendar the account already has (upsert only touches named columns)
        },
        { onConflict: 'user_id' },
      )
      // the written row comes back rather than being read again: the calendar
      // id this preserved is the one thing the reply still needs, and the
      // deadline has no room for a third round-trip
      .select('google_email, calendar_id')
      .maybeSingle<Pick<Row, 'google_email' | 'calendar_id'>>()
    if (writeError) return fail(503, 'unreachable')

    // the `status` shape, because a claim that succeeds IS the connection
    return ok({
      connected: true,
      email: row?.google_email ?? parked.google_email,
      calendarId: row?.calendar_id ?? null,
    })
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
