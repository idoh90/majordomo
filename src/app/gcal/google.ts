import type { GEvent } from './mapping'

/**
 * The browser's Google Calendar REST client — the CSP's one new origin.
 *
 * Thin on purpose: statuses come back as a small closed vocabulary the
 * service can act on, bodies stay Google's. Sequential requests, no batching
 * — a cycle is one or two windowed lists plus a handful of writes against a
 * per-user quota three orders of magnitude larger; batching would be
 * complexity spent on a problem this window size cannot have.
 */

const BASE = 'https://www.googleapis.com/calendar/v3'

/** why a call did not succeed */
export type GcalWhy =
  /** 401 — the access token died; the service re-mints on the next cycle */
  | 'auth'
  /** the network itself — offline is a normal state, not an error */
  | 'offline'
  /** 404/410 — the thing addressed is not there */
  | 'missing'
  /** 409 — an event with that id already exists (another device, or cancelled) */
  | 'exists'
  /** everything else (5xx, 403/429 quota, unparseable) */
  | 'fail'

type Result<T> = { ok: true; data: T } | { ok: false; why: GcalWhy }

const why = (status: number): GcalWhy =>
  status === 401 ? 'auth' : status === 404 || status === 410 ? 'missing' : status === 409 ? 'exists' : 'fail'

async function gfetch(token: string, path: string, init?: RequestInit): Promise<Response | 'offline'> {
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    return 'offline'
  }
}

/** every page of a calendar's window, or why not. Completeness matters more
 *  than partial progress here: the pull reconciler's delete sweep reads
 *  absence, and a truncated listing must never read as one. */
export async function listEvents(
  token: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<Result<GEvent[]>> {
  const items: GEvent[] = []
  let pageToken: string | null = null
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      timeMin,
      timeMax,
      maxResults: '250',
      // cancelled instances of recurring events still arrive under
      // singleEvents; they are filtered by status, not by the query
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events?${params}`)
    if (res === 'offline') return { ok: false, why: 'offline' }
    if (!res.ok) return { ok: false, why: why(res.status) }
    let body: { items?: GEvent[]; nextPageToken?: string }
    try {
      body = (await res.json()) as typeof body
    } catch {
      return { ok: false, why: 'fail' }
    }
    items.push(...(body.items ?? []))
    pageToken = body.nextPageToken ?? null
    if (!pageToken) return { ok: true, data: items }
  }
  // more than 5,000 events in a 67-day window — refuse rather than pretend
  return { ok: false, why: 'fail' }
}

export async function insertCalendar(token: string, summary: string): Promise<Result<string>> {
  const res = await gfetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary }),
  })
  if (res === 'offline') return { ok: false, why: 'offline' }
  if (!res.ok) return { ok: false, why: why(res.status) }
  try {
    const body = (await res.json()) as { id?: string }
    return body.id ? { ok: true, data: body.id } : { ok: false, why: 'fail' }
  } catch {
    return { ok: false, why: 'fail' }
  }
}

/** best-effort tidy-up when this device lost the create race */
export async function deleteCalendar(token: string, calendarId: string): Promise<void> {
  await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}`, { method: 'DELETE' })
}

export async function insertEvent(
  token: string,
  calendarId: string,
  body: Record<string, unknown>,
): Promise<'ok' | GcalWhy> {
  const res = await gfetch(token, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (res === 'offline') return 'offline'
  return res.ok ? 'ok' : why(res.status)
}

export async function patchEvent(
  token: string,
  calendarId: string,
  eventId: string,
  body: Record<string, unknown>,
): Promise<'ok' | GcalWhy> {
  const res = await gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
  if (res === 'offline') return 'offline'
  return res.ok ? 'ok' : why(res.status)
}

export async function deleteEvent(
  token: string,
  calendarId: string,
  eventId: string,
): Promise<'ok' | GcalWhy> {
  const res = await gfetch(
    token,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  )
  if (res === 'offline') return 'offline'
  return res.ok ? 'ok' : why(res.status)
}
