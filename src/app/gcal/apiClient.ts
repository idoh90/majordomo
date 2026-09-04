import { getClient } from '../../core/auth/client'
import { voice } from '../../core/voice'

/**
 * The client half of `api/google.ts` — typed wrappers over its six actions.
 *
 * The endpoint speaks a CLOSED machine vocabulary (`{ error: code }`); the
 * words live here, in voice, where every string in this app lives. A relative
 * URL is correct on production and under `vercel dev`; on bare `npm run dev`
 * (5173 serves no `api/`) the call 404s and reads as unreachable — honest.
 */

export type GcalErrorCode =
  | 'off'
  | 'offline'
  | 'unreachable'
  | 'signin'
  | 'reconnect'
  | 'google'
  | 'notConnected'
  | 'other'

export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: GcalErrorCode; raw: string }

export function errorLine(code: GcalErrorCode, raw: string): string {
  const e = voice.calendars.errors
  switch (code) {
    case 'off':
      return e.off
    case 'offline':
      return e.offline
    case 'unreachable':
      return e.unreachable
    case 'signin':
      return e.signin
    case 'reconnect':
      return e.reconnect
    case 'google':
      return e.google
    case 'notConnected':
      return e.notConnected
    default:
      // a code this build does not know (server newer/older than the client) —
      // name it rather than inventing a meaning for it
      return voice.sync.failed(raw)
  }
}

const toCode = (raw: string): GcalErrorCode => {
  switch (raw) {
    case 'off':
    case 'unreachable':
    case 'reconnect':
    case 'google':
    case 'notConnected':
      return raw
    case 'signin':
    case 'invalid':
      // an invalid session and a missing one have the same remedy
      return 'signin'
    case 'misconfigured':
      // a build whose server half is not provisioned is a build where the
      // feature is off — same sentence, same remedy (none, for the user)
      return 'off'
    default:
      return 'other'
  }
}

async function bearer(): Promise<string | null> {
  const client = getClient()
  if (!client) return null
  try {
    const sb = await client
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

async function call<T>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  const token = await bearer()
  if (!token) return { ok: false, code: 'signin', raw: 'signin' }
  let res: Response
  try {
    res = await fetch('/api/google', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  } catch {
    // a network TypeError — offline is a normal state, not an event
    return { ok: false, code: 'offline', raw: 'offline' }
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    // 404 HTML from `npm run dev`, a proxy page, anything unparseable
    return { ok: false, code: 'unreachable', raw: `http ${res.status}` }
  }
  if (!res.ok) {
    const raw = String((json as { error?: unknown }).error ?? `http ${res.status}`)
    return { ok: false, code: toCode(raw), raw }
  }
  return { ok: true, data: json as T }
}

export type StatusReply = { connected: boolean; email: string | null; calendarId: string | null }
export type TokenReply = {
  accessToken: string
  expiresAt: number
  email: string | null
  calendarId: string | null
}

export const gcalApi = {
  begin: (email: string | null) =>
    call<{ url: string }>(email ? { action: 'begin', email } : { action: 'begin' }),
  /**
   * The last step of the consent walk: spend the one-use secret the callback
   * came home with. It answers in the `status` shape, because a claim that
   * succeeds IS the connection — there is nothing else to ask afterwards.
   */
  claim: (n: string) => call<StatusReply>({ action: 'claim', n }),
  status: () => call<StatusReply>({ action: 'status' }),
  token: () => call<TokenReply>({ action: 'token' }),
  calendar: (id: string, previous: string | null) =>
    call<{ ok: true; calendarId: string }>(
      previous ? { action: 'calendar', id, previous } : { action: 'calendar', id },
    ),
  disconnect: () => call<{ ok: true }>({ action: 'disconnect' }),
}
