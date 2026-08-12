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
            if (r.deleted) {
              // deleted FOR THE CREW, by a member who declared it. The local
              // copy goes, and so must this device's own dual-homed personal
              // record — otherwise the venture stub resurrects on our other
              // devices with a board that no longer exists anywhere. This is
              // declared intent arriving over the wire, not a diff.
              if (byId.has(r.id)) {
                byId.delete(r.id)
                noteDeleted('workshop', 'venture', [r.id])
              }
              continue
            }
            const p = r.payload as SharedVenture
            const cur = byId.get(r.id)
            if (cur) {
              // the crew's word on the co-edited face; the shelf stays ours.
              // `shareId` is force-restored — a stale personal copy that won
              // LWW in personal space may have arrived without it.
              byId.set(r.id, {
                ...cur,
                name: p.name,
                status: p.status,
                goalH: p.goalH,
                shippedAt: p.shippedAt,
                createdAt: p.createdAt,
                shareId,
              })
            } else {
              const order = [...byId.values()].reduce((m, v) => Math.max(m, v.order + 1), 0)
              byId.set(r.id, { ...p, order, shareId } as Venture)
            }
          }
          ventures = [...byId.values()].sort(byOrder)
        }
        return {
          ventures,
          cards: mergeList<BoardCard>(s.cards, of(records, 'card')),
          threads: mergeList<Thread>(s.threads, of(records, 'thread')),
          milestones: mergeList<Milestone>(s.milestones, of(records, 'milestone')),
          workEntries: mergeMap<WorkEntry>(s.workEntries, of(records, 'work')),
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

/** the shareIds the sources are currently built from — the service's restart key */
export function shareIdsOf(ventures: Venture[]): string[] {
  const ids = new Set<string>()
  for (const v of ventures) if (v.shareId) ids.add(v.shareId)
  return [...ids].sort()
}
