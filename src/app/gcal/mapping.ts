import type { CalendarEvent } from '../../core/events/types'
import { voice } from '../../core/voice'

/**
 * Pure mapping between the estate's events and Google's — no stores, no I/O.
 *
 * IDENTITY IS DETERMINISTIC IN BOTH DIRECTIONS, which is what makes the whole
 * bridge stateless enough to survive devices racing each other (the Watch's
 * starter-template trick, applied to a calendar):
 *
 *   · outbound, a local event's Google id is a total, reversible encoding of
 *     its local id — so any device pushes the SAME Google event, and an id
 *     read back from Google decodes to the local record it mirrors;
 *   · inbound, a Google event's local mirror id is derived from its Google id
 *     — so two devices ingesting the same event write ONE `records` row and
 *     LWW converges instead of duplicating.
 *
 * Google event ids must be 5–1024 chars of base32hex ([0-9a-v]). Lowercase
 * hex is a subset, so 'mj' + hex(utf8(localId)) is always legal, covers every
 * id shape this app has ever minted (uuids, `makeId`'s base36 fallback, demo
 * literals), and round-trips exactly. Google's own ids (recurrence instances
 * carry '_' and uppercase) can never match the pattern, so decoding doubles
 * as "is this ours".
 */

/* ------------------------------------------------------------------ window */

/** the rolling window both directions work in: history is left alone, the
 *  near future is kept true */
export const PAST_DAYS = 7
export const FUTURE_DAYS = 60

/* --------------------------------------------------------------------- ids */

const HEX = '0123456789abcdef'

/** local id → Google event id. Null only for a pathological id that would
 *  blow Google's 1024-char cap (no real id comes close). */
export function encodeGid(localId: string): string | null {
  const bytes = new TextEncoder().encode(localId)
  if (bytes.length > 511) return null
  let out = 'mj'
  for (const b of bytes) out += HEX[b >> 4] + HEX[b & 15]
  return out
}

/** Google event id → local id, or null when the id is not one of ours. */
export function decodeGid(gid: string): string | null {
  if (!/^mj(?:[0-9a-f]{2})+$/.test(gid)) return null
  const bytes = new Uint8Array((gid.length - 2) / 2)
  for (let i = 2; i < gid.length; i += 2) {
    bytes[(i - 2) / 2] = parseInt(gid.slice(i, i + 2), 16)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** a foreign Google event's local mirror id — same on every device */
export const mirrorId = (eventId: string): string => `g-${eventId}`

/** `gcal:<calendarRef>/<eventId>` — the mirror's provenance, and the pull
 *  reconciler's scope key */
export const mirrorRef = (calendarRef: string, eventId: string): string =>
  `gcal:${calendarRef}/${eventId}`

/* ------------------------------------------------------------------ events */

export type GEventTime = { date?: string; dateTime?: string; timeZone?: string }

export type GEvent = {
  id: string
  status?: string
  summary?: string
  start?: GEventTime
  end?: GEventTime
  /** Google's own last-modified instant */
  updated?: string
  extendedProperties?: { private?: Record<string, string> }
}

export type MirrorShape = Pick<
  CalendarEvent,
  'source' | 'sourceRef' | 'kind' | 'title' | 'start' | 'end' | 'allDay'
>

/**
 * A Google event → the estate's shape. Null when the item cannot be a block
 * (no usable times).
 *
 * Time rules, stated once:
 *  · timed (`dateTime`, which always carries an offset) → the exact instant,
 *    stored as ISO; the Manor renders instants at device-local wall time.
 *  · all-day (`date`, `YYYY-MM-DD`) → the LOCAL day's midnight, built from
 *    components with the local Date constructor — never string-parsed, which
 *    reads as UTC and lands the chip on the wrong day east or west of it
 *    (core/dates.ts's oldest warning, arriving from the other direction).
 *    Written `start === end, allDay: true`, the estate's own convention.
 *    A multi-day span keeps one chip on its first day (v1).
 */
export function toMirrorShape(item: GEvent, calendarRef: string): MirrorShape | null {
  const base = {
    source: 'google' as const,
    sourceRef: mirrorRef(calendarRef, item.id),
    kind: 'abroad' as const,
    title: item.summary?.trim() || voice.calendars.untitled,
  }
  if (item.start?.dateTime && item.end?.dateTime) {
    const s = new Date(item.start.dateTime)
    const e = new Date(item.end.dateTime)
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) return null
    return { ...base, start: s.toISOString(), end: e.toISOString() }
  }
  if (item.start?.date) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(item.start.date)
    if (!m) return null
    const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const iso = day.toISOString()
    return { ...base, start: iso, end: iso, allDay: true }
  }
  return null
}

/** the estate's event → Google's shape, for the app-created calendar. ISO-Z
 *  instants: Google renders them in the user's own calendar timezone, which
 *  is the same wall clock the Manor shows on this device. `status` is always
 *  'confirmed' so a PATCH doubles as the resurrection path for an event
 *  someone cancelled at Google (the estate is authority for its own records).
 */
export function toGoogleEvent(e: CalendarEvent): Record<string, unknown> {
  return {
    summary: e.title,
    start: { dateTime: e.start },
    end: { dateTime: e.end },
    status: 'confirmed',
    // belt beside the id encoding: marks the event as this app's
    extendedProperties: { private: { mj: '1' } },
  }
}

/** did the mirror drift from what Google now says? (notes are not mirrored) */
export function mirrorDiffers(existing: CalendarEvent, next: MirrorShape): boolean {
  return (
    existing.title !== next.title ||
    existing.start !== next.start ||
    existing.end !== next.end ||
    Boolean(existing.allDay) !== Boolean(next.allDay) ||
    existing.sourceRef !== next.sourceRef
  )
}
