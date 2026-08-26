import { useAuthStore } from '../../core/auth/store'
import { isDayKey } from '../../core/dates'
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

/* ------------------------------------------------------------- the shape gate
 *
 * OWNERSHIP is only half the question. `heldBy`/`held` decide WHETHER a crew may
 * speak for a record; nothing there says the record makes SENSE. A crewmate
 * pushing a perfectly well-addressed milestone whose day reads `"\u{1F480}"` was
 * inside its rights by every check we had — and that string reached
 * `dayKeyToDate(...).toISOString()` inside the marker heal pass, which the Manor
 * mounts on every boot. One record, and the app stopped opening: the recovery
 * screen on every reload, with the offending record sitting in localStorage.
 * A string where a number belongs did the same quieter damage — `t += en.h`
 * turned every hours figure into text until the first `.toFixed(1)` threw.
 *
 * So a record must also be the SHAPE the readers were written against. This is
 * an allow-list per kind, checking exactly the fields something downstream
 * relies on, and a record that fails is dropped whole rather than repaired:
 * half a record is not a record, an honest peer will push a correct one, and a
 * hostile peer gets nothing.
 *
 * Every field below is written unconditionally by the store's own creators, so
 * this cannot reject anything the app itself produced — which is the property
 * that matters, since dropping a crewmate's real work would be its own bug.
 */

const str = (v: unknown): v is string => typeof v === 'string'
/**
 * A string, and not an essay.
 *
 * Nothing bounded any of these, and the store's persist wrapper writes to
 * localStorage synchronously inside `setState` — so a crewmate could hand this
 * device a single card whose body was most of the origin's whole storage
 * budget, and the write that failed took the fold down with it.
 *
 * The ceilings are deliberately far above anything a person types: the point
 * is to make one record cheap to reject, not to have an opinion about how long
 * a note may be. Nothing the board can produce comes near them, which is the
 * property the whole gate depends on — a check that eats a crewmate's real
 * work is its own bug.
 */
const text = (v: unknown, max: number): boolean => str(v) && v.length <= max
const NAME = 400
const TITLE = 4_000
const BODY = 200_000
const URL_ = 8_000
const ID = 400
const bool = (v: unknown): v is boolean => typeof v === 'boolean'
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
/** an instant `new Date()` can actually read — every ISO field is one */
const iso = (v: unknown): boolean => str(v) && !Number.isNaN(new Date(v).getTime())
const opt = (v: unknown, ok: (x: unknown) => boolean): boolean => v === undefined || ok(v)

const STATUSES = new Set<string>(['spark', 'building', 'shipped', 'shelved'])
const CARD_TYPES = new Set<string>(['title', 'note', 'task', 'link'])

const SHAPES: Record<string, (p: Record<string, unknown>) => boolean> = {
  venture: (p) =>
    text(p.name, NAME) &&
    str(p.status) &&
    STATUSES.has(p.status) &&
    num(p.goalH) &&
    p.goalH >= 0 &&
    iso(p.createdAt) &&
    opt(p.shippedAt, iso),
  card: (p) =>
    text(p.ventureId, ID) &&
    str(p.type) &&
    CARD_TYPES.has(p.type) &&
    text(p.title, TITLE) &&
    num(p.col) &&
    num(p.row) &&
    iso(p.createdAt) &&
    opt(p.body, (x) => text(x, BODY)) &&
    opt(p.url, (x) => text(x, URL_)) &&
    opt(p.done, bool) &&
    opt(p.doneBy, (x) => text(x, ID)) &&
    opt(p.dueAt, iso) &&
    opt(p.parentId, (x) => text(x, ID)) &&
    opt(p.fx, num) &&
    opt(p.fy, num),
  thread: (p) => text(p.ventureId, ID) && text(p.from, ID) && text(p.to, ID),
  milestone: (p) =>
    text(p.ventureId, ID) &&
    text(p.title, TITLE) &&
    // the one that bricked the app: a day key must be a day this app can read
    isDayKey(p.on) &&
    bool(p.done) &&
    iso(p.countFrom) &&
    opt(p.doneAt, iso),
  work: (p) =>
    text(p.ventureId, ID) && iso(p.at) && num(p.h) && p.h >= 0 && text(p.by, ID),
}

/**
 * Drop anything malformed before ownership is even considered. A TOMBSTONE
 * carries no payload to inspect and is judged on ownership alone; an unknown
 * kind is dropped, because a reader for it does not exist here.
 */
function wellFormed(records: IncomingRecord[]): IncomingRecord[] {
  return records.filter((r) => {
    if (r.deleted) return true
    const shape = SHAPES[r.kind]
    if (!shape) return false
    const p = r.payload
    return p !== null && typeof p === 'object' && shape(p as Record<string, unknown>)
  })
}

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
  strikeable: Set<string>,
  localVentureById: Map<string, string>,
): IncomingRecord[] {
  return records.filter((r) => {
    if (r.deleted) {
      const local = localVentureById.get(r.id)
      return local === undefined || strikeable.has(local)
    }
    const claimed = (r.payload as { ventureId?: unknown } | null)?.ventureId
    return typeof claimed === 'string' && mine.has(claimed)
  })
}

/**
 * THE LEDGER'S AUTHOR IS THE REGISTRY'S, NEVER THE PAYLOAD'S.
 *
 * A work entry says who did the hours, and the fold used to believe its `by`
 * field — which the pushing client writes. Two things followed. Any crewmate
 * could sign somebody else's name to work, or their own to another's. And
 * because the ledger is keyed by the AUTHOR'S OWN EVENT ID, and those ids
 * travel on the wire where every member can read them, a crewmate could push
 * `{ id: <a victim's event id>, h: 0 }` and erase hours the victim had really
 * worked — from the rings, the odometer and the contribution table, on
 * everyone's screen including the victim's. The victim's own heal pass then
 * declined to put it back, because `workLedgerPatch` skips an entry it does
 * not own, and the forged `by` made it somebody else's.
 *
 * `author_id` is stamped inside the push RPC from `auth.uid()`, so it is the
 * one field on a share record the pusher does not choose. Two rules follow
 * from it: an entry is stored under the author the REGISTRY names, and an
 * entry already standing may only be rewritten by the hand that wrote it.
 *
 * A row with no stamp at all is dropped — every row this app has ever pushed
 * carries one, so an unstamped row was not written by this app.
 *
 * Tombstones are deliberately left to the venture rules: deleting a venture
 * cascades its whole ledger, other people's rows included, and that is a
 * deletion a hand is entitled to make. A row struck that way is rebuilt from
 * the author's own calendar by their next heal pass.
 */
function ledger(
  records: IncomingRecord[],
  local: Record<string, WorkEntry>,
): IncomingRecord[] {
  const out: IncomingRecord[] = []
  for (const r of records) {
    if (r.deleted) {
      out.push(r)
      continue
    }
    const author = r.authorId
    if (typeof author !== 'string' || author === '') continue
    const standing = local[r.id]
    if (standing && standing.by !== author) continue
    const p = r.payload as WorkEntry
    out.push(p.by === author ? r : { ...r, payload: { ...p, by: author } })
  }
  return out
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
      const me = useAuthStore.getState().userId
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
        // A DEVICE PUBLISHES ONLY THE HOURS IT WORKED. `adoptPrivateCopy` keeps
        // the whole ledger when a venture goes private — departed hours are
        // history — so a venture that has been through one crew still carries
        // rows authored by people from that crew. Opening it to a NEW crew used
        // to push those rows too: another person's account id, the days they
        // worked and for how long, handed to strangers they never met, and
        // drawn in the crew room under the first eight characters of their uuid.
        // The registry's own author stamp already refuses these on the far side
        // (see `ledger`), so publishing them was never anything but a leak.
        ...Object.entries(s.workEntries)
          .filter(([, en]) => ids.has(en.ventureId) && me !== null && en.by === me)
          .map(([key, en]) => rec(wing, 'work', key, en)),
      ]
    },
    subscribe: (onChange) => useWorkshopStore.subscribe(onChange),
    apply: (raw) => {
      // shape first, then ownership: a record that is not the shape its readers
      // were written against never gets as far as being asked whose it is
      const records = wellFormed(raw)
      useWorkshopStore.setState((s) => {
        let ventures = s.ventures
        /**
         * What this share held BEFORE the fold, and what the fold buried.
         *
         * Both exist for tombstones. `mine` below is computed after the venture
         * fold, so by the time a venture's own cascade — its cards, threads,
         * milestones and ledger rows, which `deleteVenture` pushes in the SAME
         * batch — is judged, the venture they name has already been removed and
         * every one of them is refused. The board then sits on every other
         * member's device forever, with no venture on the shelf to reach it
         * from, while the heal pass keeps redrawing its milestone and deadline
         * chips on the Manor. Judging a tombstone against what the share held
         * on entry is what makes a deletion complete.
         */
        const heldOnEntry = new Set(
          s.ventures.filter((v) => v.shareId === shareId).map((v) => v.id),
        )
        const buried = new Set<string>()
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
              // Deleted FOR THE CREW, by a member who declared it. The local
              // copy goes, and so must this device's own dual-homed personal
              // record — otherwise the venture stub resurrects on our other
              // devices with a board that no longer exists anywhere. This is
              // declared intent arriving over the wire, not a diff.
              //
              // CURRENTLY holds, not `heldBy`: a private copy kept on leaving
              // is not the crew's to delete. Rejoining would otherwise replay
              // the old tombstone and destroy the copy you were promised.
              if (cur && cur.shareId === shareId) {
                byId.delete(r.id)
                buried.add(r.id)
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
        // a tombstone is judged against the union: what the share holds now,
        // and what it held when this batch arrived
        const strikeable = new Set([...mine, ...heldOnEntry])
        /** id → the venture it currently hangs on, for judging tombstones */
        const ventureOf = (xs: Array<{ id: string; ventureId: string }>) =>
          new Map(xs.map((x) => [x.id, x.ventureId]))
        /** a venture the fold just buried takes its whole board with it, so an
         *  incomplete batch cannot orphan one either */
        const orphan = (v: string) => buried.has(v)

        return {
          ventures,
          cards: mergeList<BoardCard>(
            s.cards,
            held(of(records, 'card'), mine, strikeable, ventureOf(s.cards)),
          ).filter((c) => !orphan(c.ventureId)),
          threads: mergeList<Thread>(
            s.threads,
            held(of(records, 'thread'), mine, strikeable, ventureOf(s.threads)),
          ).filter((t) => !orphan(t.ventureId)),
          milestones: mergeList<Milestone>(
            s.milestones,
            held(of(records, 'milestone'), mine, strikeable, ventureOf(s.milestones)),
          ).filter((m) => !orphan(m.ventureId)),
          workEntries: Object.fromEntries(
            Object.entries(
              mergeMap<WorkEntry>(
                s.workEntries,
                ledger(
                  held(
                    of(records, 'work'),
                    mine,
                    strikeable,
                    new Map(Object.entries(s.workEntries).map(([k, e]) => [k, e.ventureId])),
                  ),
                  s.workEntries,
                ),
              ),
            ).filter(([, e]) => !orphan(e.ventureId)),
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
