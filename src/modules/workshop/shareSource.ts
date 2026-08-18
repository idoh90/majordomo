import { mergeList, mergeMap } from '../../core/sync/merge'
import { noteDeleted } from '../../core/sync/intent'
import { shareWing } from '../../core/sync/shareIntent'
import type { IncomingRecord, SyncRecord, SyncSource } from '../../core/sync/types'
import { reconcileMarkers } from './lib'
import { useWorkshopStore } from './store'
import type { BoardCard, Milestone, Thread, Venture, VentureStatus, WorkEntry } from './types'

/**
 * What one crew carries, and how its records fold back in — the share-space
 * twin of the workshop entry in app/sync/registry. It lives in the MODULE
 * because everything it knows is the Workshop's own shape; the app-floor
 * share service consumes it blind, exactly as the personal service consumes
 * SYNC_SOURCES.
 *
 * What travels: the venture's co-edited face, its cards, threads, milestones,
 * and the work ledger. What NEVER travels: `sessions` metadata and `bench` —
 * a partner's calendar is their own, and a stopwatch is one device's present.
 */

/** the venture as the crew sees it — no `order`, no `archived`, no `shareId`:
 *  where a venture sits on YOUR shelf is yours, not the crew's */
interface SharedVenture {
  id: string
  name: string
  status: VentureStatus
  goalH: number
  shippedAt?: string
  createdAt: string
}

const rec = (wing: string, kind: string, id: string, payload: unknown): SyncRecord => ({
  wing,
  kind,
  id,
  payload,
})

const of = (records: IncomingRecord[], kind: string) => records.filter((r) => r.kind === kind)

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

/**
 * May THIS crew speak for a venture already on the shelf?
 *
 * Two yeses. It is currently this crew's, which is the ordinary case. Or it is
 * private and this is the crew it came FROM — the rejoin: someone left (or was
 * removed, or the crew was disbanded), the venture went private with a note of
 * where it had been, and now they are back. Those two events look identical
 * from the wire — a crew pushing a venture whose id is already here — and the
 * note is the only thing that tells them apart.
 *
 * Everything else is a no: a venture that was never shared, and a venture
 * belonging to a different crew. Both were annexable before this check existed.
 */
function heldBy(v: Venture, shareId: string): boolean {
  if (v.shareId) return v.shareId === shareId
  return v.formerShareId === shareId
}

/**
 * Keep only the records naming a venture this share holds.
 *
 * A TOMBSTONE carries no payload to read a `ventureId` out of, so it is judged
 * on the local record it would strike: unknown means it strikes nothing and is
 * harmless, and anything else must belong to this crew. Striking a card off a
 * private board is as much a trespass as writing one onto it.
 */
function held(
  records: IncomingRecord[],
  mine: Set<string>,
  localVentureById: Map<string, string>,
): IncomingRecord[] {
  return records.filter((r) => {
    if (r.deleted) {
      const local = localVentureById.get(r.id)
      return local === undefined || mine.has(local)
    }
    const claimed = (r.payload as { ventureId?: unknown } | null)?.ventureId
    return typeof claimed === 'string' && mine.has(claimed)
  })
}

/**
 * One share's SyncSource. `toRecords` builds the redacted venture FRESH each
 * scan — a deliberate exception to the payload-identity rule, defeating the
 * engine's WeakMap for exactly one record per crew. The cost is one small
 * JSON.stringify per scan; the alternative is `order` churn from every member
 * rearranging their own shelf.
 */
export function shareSource(shareId: string): SyncSource {
  const wing = shareWing(shareId)
  return {
    wing,
    toRecords: () => {
      const s = useWorkshopStore.getState()
      const mine = s.ventures.filter((v) => v.shareId === shareId)
      const ids = new Set(mine.map((v) => v.id))
      return [
        ...mine.map((v) => {
          const shared: SharedVenture = {
            id: v.id,
            name: v.name,
            status: v.status,
            goalH: v.goalH,
            shippedAt: v.shippedAt,
            createdAt: v.createdAt,
          }
          return rec(wing, 'venture', v.id, shared)
        }),
        ...s.cards.filter((c) => ids.has(c.ventureId)).map((c) => rec(wing, 'card', c.id, c)),
        ...s.threads.filter((t) => ids.has(t.ventureId)).map((t) => rec(wing, 'thread', t.id, t)),
        ...s.milestones
          .filter((m) => ids.has(m.ventureId))
          .map((m) => rec(wing, 'milestone', m.id, m)),
        ...Object.entries(s.workEntries)
          .filter(([, en]) => ids.has(en.ventureId))
          .map(([key, en]) => rec(wing, 'work', key, en)),
      ]
    },
    subscribe: (onChange) => useWorkshopStore.subscribe(onChange),
    apply: (records) => {
      useWorkshopStore.setState((s) => {
        let ventures = s.ventures
        const incoming = of(records, 'venture')
        if (incoming.length > 0) {
          const byId = new Map(ventures.map((v) => [v.id, v]))
          for (const r of incoming) {
            const cur = byId.get(r.id)
            // THE OWNERSHIP CHECK. A record is only ever allowed to speak for a
            // venture this crew actually holds. Without it the fold matched on
            // the id alone, and since a record id is whatever the client says
            // it is, any crew could name a venture it never contained and be
            // believed: the id force-set `shareId` to the pushing crew, so a
            // private venture — or one belonging to a different crew — was
            // annexed on the next pull. See `heldBy` for why a venture that has
            // gone private can still be re-adopted by the crew it came from.
            if (cur && !heldBy(cur, shareId)) continue
            if (r.deleted) {
              // deleted FOR THE CREW, by a member who declared it. The local
              // copy goes, and so must this device's own dual-homed personal
              // record — otherwise the venture stub resurrects on our other
              // devices with a board that no longer exists anywhere. This is
              // declared intent arriving over the wire, not a diff.
              if (cur) {
                byId.delete(r.id)
                noteDeleted('workshop', 'venture', [r.id])
              }
              continue
            }
            const p = r.payload as SharedVenture | null
            if (!p || typeof p !== 'object') continue
            if (cur) {
              // the crew's word on the co-edited face; the shelf stays ours.
              // `shareId` is restored — a stale personal copy that won LWW in
              // personal space may have arrived without it — and this is also
              // where a rejoin re-adopts what `heldBy` just vouched for.
              byId.set(r.id, {
                ...cur,
                name: p.name,
                status: p.status,
                goalH: p.goalH,
                shippedAt: p.shippedAt,
                createdAt: p.createdAt,
                shareId,
                formerShareId: undefined,
              })
            } else {
              // Built FIELD BY FIELD, never spread from the payload. The share
              // payload is the redacted face and nothing else; spreading it let
              // a crew set anything a Venture has — `archived`, `order`, its own
              // `formerShareId` — on a record landing on somebody else's shelf.
              const order = [...byId.values()].reduce((m, v) => Math.max(m, v.order + 1), 0)
              byId.set(r.id, {
                id: r.id,
                name: p.name,
                status: p.status,
                goalH: p.goalH,
                shippedAt: p.shippedAt,
                createdAt: p.createdAt,
                order,
                shareId,
              })
            }
          }
          ventures = [...byId.values()].sort(byOrder)
        }

        /**
         * …and the same rule for everything hanging off a venture.
         *
         * Cards, threads, milestones and ledger entries all name a `ventureId`,
         * and the fold used to merge them into the app-wide lists on the
         * strength of that name alone. So a crew could hang a card on a
         * PRIVATE venture, restyle one on another crew's board, or post a
         * milestone whose title then appears as a chip on the owner's calendar
         * — writing its own text into a stranger's week. Now a record is folded
         * only if the venture it names is one THIS share holds.
         *
         * Computed after the venture fold on purpose: a fresh join carries the
         * venture and its board in one batch, and the board must be admitted on
         * the strength of the venture that just arrived.
         */
        const mine = new Set(
          ventures.filter((v) => v.shareId === shareId).map((v) => v.id),
        )
        /** id → the venture it currently hangs on, for judging tombstones */
        const ventureOf = (xs: Array<{ id: string; ventureId: string }>) =>
          new Map(xs.map((x) => [x.id, x.ventureId]))

        return {
          ventures,
          cards: mergeList<BoardCard>(
            s.cards,
            held(of(records, 'card'), mine, ventureOf(s.cards)),
          ),
          threads: mergeList<Thread>(
            s.threads,
            held(of(records, 'thread'), mine, ventureOf(s.threads)),
          ),
          milestones: mergeList<Milestone>(
            s.milestones,
            held(of(records, 'milestone'), mine, ventureOf(s.milestones)),
          ),
          workEntries: mergeMap<WorkEntry>(
            s.workEntries,
            held(
              of(records, 'work'),
              mine,
              new Map(Object.entries(s.workEntries).map(([k, e]) => [k, e.ventureId])),
            ),
          ),
        }
      })
      // markers are never carried — draw our own from what just arrived
      // (sandbox-guarded inside, engines muted by the caller)
      const w = useWorkshopStore.getState()
      reconcileMarkers(w.milestones, w.cards, Date.now())
    },
  }
}

/** one source per crew this device currently belongs to */
export function buildShareSources(): SyncSource[] {
  const ids = new Set<string>()
  for (const v of useWorkshopStore.getState().ventures) {
    if (v.shareId) ids.add(v.shareId)
  }
  return [...ids].map(shareSource)
}

if (import.meta.env.DEV) {
  // the fold, drivable from a page — how the annexation regression is checked
  // (scripts drive `__shareFold(shareId).apply([...])` with forged records)
  ;(window as unknown as Record<string, unknown>).__shareFold = shareSource
}

/** the shareIds the sources are currently built from — the service's restart key */
export function shareIdsOf(ventures: Venture[]): string[] {
  const ids = new Set<string>()
  for (const v of ventures) if (v.shareId) ids.add(v.shareId)
  return [...ids].sort()
}
