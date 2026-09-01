import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { makeId } from '../../core/ids'
import { localDayKey } from '../../core/dates'
import { hoursOf } from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import { useAuthStore } from '../../core/auth/store'
import { voice } from '../../core/voice'
import { noteDeleted } from '../../core/sync/intent'
import { normalizeUrl } from './url'
import { noteShareDeleted } from '../../core/sync/shareIntent'
import {
  dueMarkerTitle,
  dueOf,
  dueRef,
  effectiveDueDay,
  effectiveMsDay,
  msRef,
  nextCol,
  nextRow,
  projRef,
  syncMarker,
  ventureOfEvent,
} from './lib'
import type {
  Bench,
  BoardCard,
  CardType,
  Fulfillment,
  Milestone,
  SessionMeta,
  ShareMember,
  Thread,
  Venture,
  VentureStatus,
  WorkEntry,
} from './types'

/**
 * The Workshop's blob — `majordomo-workshop` v1. Bench sessions themselves
 * live in the shared events store; this holds the shelf (ventures), each
 * venture's pegboard (cards + threads), the milestones, fulfillment metadata
 * keyed by event id, and the live bench timer. Milestone mutations write
 * their Manor marker through the events store in the same action
 * (`syncMarker`); `reconcileMarkers` heals any drift.
 */

/** what DOWN TOOLS produced — the component words the toast from this */
export type BenchStop =
  | { kind: 'logged'; h: number; m: number }
  | { kind: 'short' }
  | { kind: 'sandbox' }
  | { kind: 'idle' }

interface WorkshopState {
  ventures: Venture[]
  cards: BoardCard[]
  threads: Thread[]
  milestones: Milestone[]
  sessions: Record<string, SessionMeta>
  /** persisted: a phone locked mid-session must not lose the running clock */
  bench: Bench | null
  /** the crew ledgers — every member's fulfilled hours, keyed by the author's
   *  event id. Mine are written by the fulfillment actions; the rest arrive
   *  through the share. Persisted: stats must read offline. */
  workEntries: Record<string, WorkEntry>
  /** crew rosters by shareId — cached so labels render offline, and so a
   *  departed member's name survives on their old work */
  members: Record<string, ShareMember[]>

  addVenture: (name: string, goalH: number) => Venture
  updateVenture: (id: string, patch: Partial<Omit<Venture, 'id'>>) => void
  setStatus: (id: string, status: VentureStatus) => void
  archiveVenture: (id: string) => void
  /** hard delete: cascades cards/threads/milestones (and their markers); bench
   *  EVENTS stay on the calendar as history — stats ignore unknown refs */
  deleteVenture: (id: string) => void

  addCard: (
    ventureId: string,
    type: CardType,
    title: string,
    extra?: {
      body?: string
      url?: string
      threadTo?: string
      parentId?: string
      dueAt?: string
      /** freeform spot on the desktop wall — where the press asked for it */
      at?: { x: number; y: number }
    },
  ) => BoardCard
  updateCard: (id: string, patch: Partial<Omit<BoardCard, 'id' | 'ventureId'>>) => void
  toggleCardDone: (id: string) => void
  /** hang a card under a heading (or loose, with `undefined`) at a position in
   *  that column — the one write behind every board drag */
  placeCard: (id: string, parentId: string | undefined, index: number) => void
  /** slide a heading, and its whole column with it, along the wall */
  moveTitle: (id: string, index: number) => void
  deleteCard: (id: string) => void

  addThread: (ventureId: string, from: string, to: string) => void
  deleteThread: (id: string) => void

  addMilestone: (ventureId: string, title: string, on: string) => void
  updateMilestone: (id: string, patch: Partial<Omit<Milestone, 'id' | 'ventureId'>>) => void
  setMilestoneDone: (id: string, done: boolean) => void
  deleteMilestone: (id: string) => void

  setSessionMeta: (eventId: string, meta: SessionMeta) => void
  fulfill: (eventId: string, fulfillment: Fulfillment, doneH?: number) => void
  /** drop metadata whose event no longer exists (call with committed ids only) */
  pruneSessions: (liveEventIds: string[]) => void

  startBench: (ventureId: string) => void
  /** stop the timer and log the elapsed span as a born-done session */
  stopBench: () => BenchStop

  /* --- the crew --- */
  setMembers: (shareId: string, members: ShareMember[]) => void
  /** fold ledger entries in (mine at fulfillment time, the crew's from sync) */
  upsertWorkEntries: (entries: Record<string, WorkEntry>) => void
  /** the share is over for this device — the venture becomes private again,
   *  records intact ("when in doubt, resurrect") */
  adoptPrivateCopy: (shareId: string) => void
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

/**
 * Redraw one card's delivery chip on the Manor after it changed. Called for
 * EVERY card mutation rather than only the obvious one: a deadline leaves the
 * calendar when the job is struck, when the card is retyped away from a task,
 * when it is renamed (the chip carries the title) and when it is taken down —
 * and a chip that outlives its card is exactly the kind of ghost the heal pass
 * exists to catch after the fact rather than the way it should be avoided.
 */
function syncDue(card: BoardCard | undefined): void {
  if (!card) return
  syncMarker(
    dueRef(card.id),
    effectiveDueDay(card, Date.now()),
    dueOf(card) ? dueMarkerTitle(card) : '',
  )
}

export const useWorkshopStore = create<WorkshopState>()(
  persist(
    (set, get) => {
      /**
       * Mirror one session's fulfillment into the crew ledger. Called after
       * every fulfillment write; a no-op unless the event belongs to a crew
       * venture. Reads COMMITTED events only — a what-if draft's session must
       * not put hours on the crew's books, and the heal pass catches up after
       * the rehearsal is applied. Skipped when signed out (an entry needs an
       * author); the same heal pass writes it after sign-in.
       */
      const syncLedger = (eventId: string): void => {
        const s = get()
        const meta = s.sessions[eventId]
        if (!meta) return
        const ev = useEventsStore.getState().events.find((e) => e.id === eventId)
        if (!ev) return
        const ventureId = ventureOfEvent(ev)
        if (!ventureId) return
        const venture = s.ventures.find((v) => v.id === ventureId)
        if (!venture?.shareId) return
        const by = useAuthStore.getState().userId
        if (!by) return
        const h =
          meta.fulfillment === 'done'
            ? hoursOf(ev)
            : meta.fulfillment === 'partial'
              ? (meta.doneH ?? 0)
              : 0
        const existing = s.workEntries[eventId]
        // never written and nothing to say — do not mint a zero
        if (!existing && h === 0) return
        if (
          existing &&
          existing.h === h &&
          existing.at === ev.start &&
          existing.by === by &&
          existing.ventureId === ventureId
        ) {
          return
        }
        set((st) => ({
          workEntries: { ...st.workEntries, [eventId]: { ventureId, at: ev.start, h, by } },
        }))
      }

      return {
      ventures: [],
      cards: [],
      threads: [],
      milestones: [],
      sessions: {},
      bench: null,
      workEntries: {},
      members: {},

      addVenture: (name, goalH) => {
        const venture: Venture = {
          id: makeId(),
          name,
          status: 'spark',
          goalH: Math.max(0, goalH),
          order: get().ventures.reduce((m, v) => Math.max(m, v.order + 1), 0),
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ ventures: [...s.ventures, venture].sort(byOrder) }))
        return venture
      },
      updateVenture: (id, patch) =>
        set((s) => ({
          ventures: s.ventures.map((v) => (v.id === id ? { ...v, ...patch, id } : v)).sort(byOrder),
        })),
      setStatus: (id, status) =>
        set((s) => ({
          ventures: s.ventures.map((v) =>
            v.id === id
              ? {
                  ...v,
                  status,
                  shippedAt: status === 'shipped' ? new Date().toISOString() : v.shippedAt,
                }
              : v,
          ),
        })),
      archiveVenture: (id) =>
        set((s) => ({
          ventures: s.ventures.map((v) => (v.id === id ? { ...v, archived: true } : v)),
        })),
      deleteVenture: (id) => {
        for (const m of get().milestones.filter((m) => m.ventureId === id)) {
          syncMarker(msRef(m.id), null, '')
        }
        for (const c of get().cards.filter((c) => c.ventureId === id && dueOf(c))) {
          syncMarker(dueRef(c.id), null, '')
        }
        // the cascade has to be declared in full: a venture's cards, threads
        // and milestones go with it, and each is its own record
        const before = get()
        const shareId = before.ventures.find((v) => v.id === id)?.shareId
        const cardIds = before.cards.filter((c) => c.ventureId === id).map((c) => c.id)
        const threadIds = before.threads.filter((t) => t.ventureId === id).map((t) => t.id)
        const msIds = before.milestones.filter((m) => m.ventureId === id).map((m) => m.id)
        if (shareId) {
          // a crew venture's records live in the share — deleting it is
          // deleting it FOR EVERYONE, and the tombstones say so there. The
          // venture record itself is dual-homed, so its personal copy is
          // buried too; the ledger goes with the venture.
          noteShareDeleted(shareId, 'venture', [id])
          noteShareDeleted(shareId, 'card', cardIds)
          noteShareDeleted(shareId, 'thread', threadIds)
          noteShareDeleted(shareId, 'milestone', msIds)
          noteShareDeleted(
            shareId,
            'work',
            Object.entries(before.workEntries)
              .filter(([, en]) => en.ventureId === id)
              .map(([key]) => key),
          )
          noteDeleted('workshop', 'venture', [id])
        } else {
          noteDeleted('workshop', 'venture', [id])
          noteDeleted('workshop', 'card', cardIds)
          noteDeleted('workshop', 'thread', threadIds)
          noteDeleted('workshop', 'milestone', msIds)
        }
        set((s) => ({
          ventures: s.ventures.filter((v) => v.id !== id),
          cards: s.cards.filter((c) => c.ventureId !== id),
          threads: s.threads.filter((t) => t.ventureId !== id),
          milestones: s.milestones.filter((m) => m.ventureId !== id),
          bench: s.bench?.ventureId === id ? null : s.bench,
          workEntries: Object.fromEntries(
            Object.entries(s.workEntries).filter(([, en]) => en.ventureId !== id),
          ),
          members: shareId
            ? Object.fromEntries(Object.entries(s.members).filter(([k]) => k !== shareId))
            : s.members,
        }))
      },

      addCard: (ventureId, type, title, extra) => {
        const mine = get().cards.filter((c) => c.ventureId === ventureId)
        // a heading joins the wall at its right-hand end; anything else joins
        // the foot of the column it was assigned to
        const parentId = type === 'title' ? undefined : extra?.parentId
        const card: BoardCard = {
          id: makeId(),
          ventureId,
          type,
          title,
          body: extra?.body,
          // refused rather than repaired: a scheme this app will not open has no
          // business being stored, and a card that silently keeps one is a hole
          // waiting for the next thing that opens a URL
          url: extra?.url ? (normalizeUrl(extra.url) ?? undefined) : undefined,
          // a deadline only ever belongs to a job — see BoardCard.dueAt
          dueAt: type === 'task' ? extra?.dueAt : undefined,
          parentId,
          col: type === 'title' ? nextCol(mine) : 0,
          row: type === 'title' ? 0 : nextRow(mine, parentId),
          // a press on bare desktop board said WHERE; without one the card
          // takes the column layout's default spot (see BoardCard.fx)
          fx: extra?.at?.x,
          fy: extra?.at?.y,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ cards: [...s.cards, card] }))
        if (extra?.threadTo) get().addThread(ventureId, card.id, extra.threadTo)
        syncDue(card)
        return card
      },
      updateCard: (id, patch) => {
        // the edit path needs the same guard as the create path, or a card can
        // be given a refused scheme one keystroke after it was refused one
        const safe =
          'url' in patch
            ? { ...patch, url: patch.url ? (normalizeUrl(patch.url) ?? undefined) : undefined }
            : patch
        set((s) => ({
          cards: s.cards.map((c) => (c.id === id ? { ...c, ...safe, id, ventureId: c.ventureId } : c)),
        }))
        syncDue(get().cards.find((c) => c.id === id))
      },
      toggleCardDone: (id) => {
        // on a crew board a strike is signed, so the contribution panel can
        // say whose it was; unstriking takes the signature back with it
        const card = get().cards.find((c) => c.id === id)
        const venture = card && get().ventures.find((v) => v.id === card.ventureId)
        const me = useAuthStore.getState().userId
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === id
              ? { ...c, done: !c.done, doneBy: !c.done && venture?.shareId && me ? me : undefined }
              : c,
          ),
        }))
        syncDue(get().cards.find((c) => c.id === id))
      },
      /**
       * Reordering is a RENUMBER of the destination column, not a swap: the
       * card is spliced in at `index` and every sibling is renumbered 0..n.
       * Swapping was right when a slot could only hold one card; a column that
       * grows and shrinks needs the whole run rewritten, or two cards end up
       * sharing an order and the wall reshuffles itself on the next render.
       */
      placeCard: (id, parentId, index) =>
        set((s) => {
          const mover = s.cards.find((c) => c.id === id)
          if (!mover || mover.type === 'title') return s
          const siblings = s.cards
            .filter(
              (c) =>
                c.ventureId === mover.ventureId &&
                c.type !== 'title' &&
                c.id !== id &&
                (c.parentId ?? undefined) === parentId,
            )
            .sort((a, b) => a.row - b.row || a.createdAt.localeCompare(b.createdAt))
          const at = Math.max(0, Math.min(siblings.length, index))
          const ordered = [...siblings.slice(0, at), mover, ...siblings.slice(at)]
          const rowOf = new Map(ordered.map((c, i) => [c.id, i]))
          return {
            cards: s.cards.map((c) =>
              rowOf.has(c.id)
                ? { ...c, parentId: c.id === id ? parentId : c.parentId, row: rowOf.get(c.id)! }
                : c,
            ),
          }
        }),

      moveTitle: (id, index) =>
        set((s) => {
          const mover = s.cards.find((c) => c.id === id)
          if (!mover || mover.type !== 'title') return s
          const others = s.cards
            .filter((c) => c.ventureId === mover.ventureId && c.type === 'title' && c.id !== id)
            .sort((a, b) => a.col - b.col || a.createdAt.localeCompare(b.createdAt))
          const at = Math.max(0, Math.min(others.length, index))
          const ordered = [...others.slice(0, at), mover, ...others.slice(at)]
          const colOf = new Map(ordered.map((c, i) => [c.id, i]))
          return {
            cards: s.cards.map((c) => (colOf.has(c.id) ? { ...c, col: colOf.get(c.id)! } : c)),
          }
        }),
      deleteCard: (id) => {
        const cut = get().threads.filter((t) => t.from === id || t.to === id)
        const card = get().cards.find((c) => c.id === id)
        const shareId =
          card && get().ventures.find((v) => v.id === card.ventureId)?.shareId
        if (shareId) {
          noteShareDeleted(shareId, 'thread', cut.map((t) => t.id))
          noteShareDeleted(shareId, 'card', [id])
        } else {
          noteDeleted('workshop', 'thread', cut.map((t) => t.id))
          noteDeleted('workshop', 'card', [id])
        }
        syncMarker(dueRef(id), null, '')
        set((s) => ({
          // taking down a heading does NOT take down the work under it: the
          // children come loose and stay on the wall
          cards: s.cards
            .filter((c) => c.id !== id)
            .map((c) => (c.parentId === id ? { ...c, parentId: undefined } : c)),
          threads: s.threads.filter((t) => t.from !== id && t.to !== id),
        }))
      },

      addThread: (ventureId, from, to) => {
        if (from === to) return
        const dupe = get().threads.some(
          (t) =>
            t.ventureId === ventureId &&
            ((t.from === from && t.to === to) || (t.from === to && t.to === from)),
        )
        if (dupe) return
        set((s) => ({ threads: [...s.threads, { id: makeId(), ventureId, from, to }] }))
      },
      deleteThread: (id) => {
        const thread = get().threads.find((t) => t.id === id)
        const shareId =
          thread && get().ventures.find((v) => v.id === thread.ventureId)?.shareId
        set((s) => ({ threads: s.threads.filter((t) => t.id !== id) }))
        if (shareId) noteShareDeleted(shareId, 'thread', [id])
        else noteDeleted('workshop', 'thread', [id])
      },

      addMilestone: (ventureId, title, on) => {
        const ms: Milestone = {
          id: makeId(),
          ventureId,
          title,
          on,
          done: false,
          countFrom: new Date().toISOString(),
        }
        set((s) => ({ milestones: [...s.milestones, ms] }))
        syncMarker(msRef(ms.id), effectiveMsDay(ms, Date.now()), voice.workshop.markerMs(ms.title))
      },
      updateMilestone: (id, patch) => {
        set((s) => ({
          milestones: s.milestones.map((m) => (m.id === id ? { ...m, ...patch, id } : m)),
        }))
        // countFrom is deliberately NOT in any caller's patch: moving the day
        // must not reset the hours already counted toward it
        const ms = get().milestones.find((m) => m.id === id)
        if (ms) syncMarker(msRef(id), effectiveMsDay(ms, Date.now()), voice.workshop.markerMs(ms.title))
      },
      setMilestoneDone: (id, done) => {
        set((s) => ({
          milestones: s.milestones.map((m) =>
            m.id === id ? { ...m, done, doneAt: done ? new Date().toISOString() : undefined } : m,
          ),
        }))
        const ms = get().milestones.find((m) => m.id === id)
        if (ms) syncMarker(msRef(id), effectiveMsDay(ms, Date.now()), voice.workshop.markerMs(ms.title))
      },
      deleteMilestone: (id) => {
        const ms = get().milestones.find((m) => m.id === id)
        const shareId = ms && get().ventures.find((v) => v.id === ms.ventureId)?.shareId
        syncMarker(msRef(id), null, '')
        set((s) => ({ milestones: s.milestones.filter((m) => m.id !== id) }))
        if (shareId) noteShareDeleted(shareId, 'milestone', [id])
        else noteDeleted('workshop', 'milestone', [id])
      },

      setSessionMeta: (eventId, meta) => {
        set((s) => ({ sessions: { ...s.sessions, [eventId]: meta } }))
        syncLedger(eventId)
      },
      fulfill: (eventId, fulfillment, doneH) => {
        set((s) => ({
          sessions: {
            ...s.sessions,
            [eventId]: { ...(s.sessions[eventId] ?? {}), fulfillment, doneH },
          },
        }))
        syncLedger(eventId)
      },
      /**
       * MUST NEVER record a deletion — local garbage collection, not intent.
       * A session's metadata can arrive from another device before the event
       * it belongs to; orphans are provably inert (metaOf joins by event id),
       * so they cost bytes and nothing else. See the Study's pruneSessions for
       * the full argument — this is the same bargain.
       */
      pruneSessions: (liveEventIds) =>
        set((s) => {
          const live = new Set(liveEventIds)
          const kept = Object.entries(s.sessions).filter(([id]) => live.has(id))
          if (kept.length === Object.keys(s.sessions).length) return s
          return { sessions: Object.fromEntries(kept) }
        }),

      startBench: (ventureId) => {
        if (get().bench) return // one bench; the running clock is not overwritten
        set({ bench: { ventureId, startedAt: Date.now() } })
      },
      /**
       * DOWN TOOLS. The elapsed span becomes an ordinary calendar event, born
       * fulfilled — the timer is a second door onto the same records, not a
       * separate system. Refused while a what-if rehearsal is open: the event
       * would land in the draft and a discard would silently destroy real
       * hours. Under a minute discards instead of logging noise.
       */
      stopBench: () => {
        const bench = get().bench
        if (!bench) return { kind: 'idle' }
        const events = useEventsStore.getState()
        if (events.sandbox) return { kind: 'sandbox' }
        const elapsedMs = Date.now() - bench.startedAt
        if (elapsedMs < 60_000) {
          set({ bench: null })
          return { kind: 'short' }
        }
        const venture = get().ventures.find((v) => v.id === bench.ventureId)
        const ev = events.addEvent({
          source: 'workshop',
          sourceRef: projRef(bench.ventureId),
          kind: 'workshop',
          title: venture?.name ?? 'Bench',
          start: new Date(bench.startedAt).toISOString(),
          end: new Date().toISOString(),
        })
        get().setSessionMeta(ev.id, { fulfillment: 'done', live: true })
        set({ bench: null })
        const mins = Math.round(elapsedMs / 60_000)
        return { kind: 'logged', h: Math.floor(mins / 60), m: mins % 60 }
      },

      setMembers: (shareId, members) =>
        set((s) => ({ members: { ...s.members, [shareId]: members } })),
      upsertWorkEntries: (entries) =>
        set((s) => ({ workEntries: { ...s.workEntries, ...entries } })),
      adoptPrivateCopy: (shareId) =>
        set((s) => ({
          ventures: s.ventures.map((v) =>
            v.shareId === shareId ? { ...v, shareId: undefined } : v,
          ),
          members: Object.fromEntries(
            Object.entries(s.members).filter(([k]) => k !== shareId),
          ),
          // the ledger stays: departed hours are history, and stats for a
          // now-private venture read events again anyway
        })),
      }
    },
    {
      name: 'majordomo-workshop',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        ventures: s.ventures,
        cards: s.cards,
        threads: s.threads,
        milestones: s.milestones,
        sessions: s.sessions,
        bench: s.bench,
        workEntries: s.workEntries,
        members: s.members,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<
          Pick<
            WorkshopState,
            | 'ventures'
            | 'cards'
            | 'threads'
            | 'milestones'
            | 'sessions'
            | 'bench'
            | 'workEntries'
            | 'members'
          >
        >
        return {
          ventures: p.ventures ?? [],
          cards: p.cards ?? [],
          threads: p.threads ?? [],
          milestones: p.milestones ?? [],
          sessions: p.sessions ?? {},
          bench: p.bench ?? null,
          workEntries: p.workEntries ?? {},
          members: p.members ?? {},
        }
      },
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__workshop = useWorkshopStore

  // ?demo seeds the shelf into an empty workshop store. Session metas key on
  // the literal event ids the events-store demo uses for its bench blocks.
  if (
    new URLSearchParams(window.location.search).has('demo') &&
    useWorkshopStore.getState().ventures.length === 0
  ) {
    const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
    const dayKey = (inDays: number) => localDayKey(new Date(Date.now() + inDays * 86_400_000))
    /** a delivery deadline at a local hour, N days from today */
    const dueIso = (inDays: number, hour: number, min = 0) => {
      const d = new Date(Date.now() + inDays * 86_400_000)
      d.setHours(hour, min, 0, 0)
      return d.toISOString()
    }
    const vent = (
      id: string,
      name: string,
      status: VentureStatus,
      goalH: number,
      order: number,
      shippedAt?: string,
    ): Venture => ({ id, name, status, goalH, order, createdAt: iso(90), shippedAt })
    const card = (
      id: string,
      ventureId: string,
      type: CardType,
      title: string,
      col: number,
      row: number,
      extra?: Partial<BoardCard>,
    ): BoardCard => ({ id, ventureId, type, title, col, row, createdAt: iso(20), ...extra })
    const thread = (from: string, to: string): Thread => ({
      id: makeId(),
      ventureId: 'demo-vent-orni',
      from,
      to,
    })
    useWorkshopStore.setState({
      ventures: [
        vent('demo-vent-orni', 'The Ornithopter', 'building', 6, 0),
        vent('demo-vent-dark', 'The Darkroom', 'building', 3, 1),
        vent('demo-vent-rec', 'Field Recorder', 'spark', 0, 2),
        vent('demo-vent-pickle', 'Pickle Works', 'shipped', 0, 3, iso(60)),
      ],
      cards: [
        // three headings, each with its work hanging under it, plus one loose
        // card — the shape the wall is meant to be read in
        card('demo-title-airframe', 'demo-vent-orni', 'title', 'AIRFRAME', 0, 0),
        card('demo-card-spar', 'demo-vent-orni', 'note', 'Wing spar — swap to carbon', 0, 0, {
          parentId: 'demo-title-airframe',
          body: '3 mm tube from drawer stock; balsa cracks at the root.',
        }),
        card('demo-card-weigh', 'demo-vent-orni', 'task', 'Weigh the fuselage', 0, 1, {
          parentId: 'demo-title-airframe',
          body: 'Bare frame, no battery. Target is 41 g all in.',
          dueAt: dueIso(2, 18),
        }),
        card('demo-card-suppliers', 'demo-vent-orni', 'link', 'Spar suppliers shortlist', 0, 2, {
          parentId: 'demo-title-airframe',
          url: 'https://docs.google.com',
        }),

        card('demo-title-power', 'demo-vent-orni', 'title', 'POWER', 1, 0),
        card('demo-card-cells', 'demo-vent-orni', 'task', 'Order 2S cells', 1, 0, {
          parentId: 'demo-title-power',
          done: true,
        }),
        card('demo-card-battery', 'demo-vent-orni', 'note', 'Battery maths', 1, 1, {
          parentId: 'demo-title-power',
          body: '2S 650 runs 38 g. Weight budget 41 g with lead.',
        }),

        card('demo-title-flight', 'demo-vent-orni', 'title', 'FLIGHT', 2, 0),
        card('demo-card-servo', 'demo-vent-orni', 'task', 'Re-rig the tail servo', 2, 0, {
          parentId: 'demo-title-flight',
          // one deadline already missed, so the overdue chip has something to
          // trail — the same demonstration the overdue milestone makes
          dueAt: dueIso(-1, 9),
        }),
        card('demo-card-dihedral', 'demo-vent-orni', 'link', 'Dihedral thread — Flite Test', 2, 1, {
          parentId: 'demo-title-flight',
          url: 'https://flitetest.com',
        }),
        card('demo-card-criteria', 'demo-vent-orni', 'note', 'Ship criteria', 2, 2, {
          parentId: 'demo-title-flight',
          body: 'Sixty seconds sustained, hands off, no repairs.',
        }),

        // deliberately unassigned: the loose column has to be demonstrated too
        card('demo-card-log', 'demo-vent-orni', 'note', 'Field log — 12 Aug', 0, 0, {
          body: 'Wind 12 kt gusting. Too much for a first hop.',
        }),

        card('demo-card-enlarger', 'demo-vent-dark', 'note', 'Enlarger lens seized', 0, 0, {
          body: 'Penetrating oil overnight, then the strap wrench.',
        }),
      ],
      threads: [
        thread('demo-card-spar', 'demo-card-suppliers'),
        thread('demo-card-cells', 'demo-card-battery'),
        thread('demo-card-dihedral', 'demo-card-criteria'),
        thread('demo-card-battery', 'demo-card-servo'),
      ],
      milestones: [
        {
          id: 'demo-ms-flight',
          ventureId: 'demo-vent-orni',
          title: 'Prototype flight',
          on: dayKey(12),
          done: false,
          countFrom: iso(21),
        },
        {
          id: 'demo-ms-enlarger',
          ventureId: 'demo-vent-dark',
          title: 'Enlarger rebuild',
          on: dayKey(28),
          done: false,
          countFrom: iso(14),
        },
        {
          id: 'demo-ms-firmware',
          ventureId: 'demo-vent-rec',
          title: 'Firmware v0.2',
          on: dayKey(-3),
          done: false,
          countFrom: iso(10),
        },
      ],
      // the events demo seeds 'demo-bench-*' blocks; these reconcile them
      sessions: {
        'demo-bench-1': { fulfillment: 'done', live: true },
        'demo-bench-2': { fulfillment: 'done' },
        'demo-bench-3': { fulfillment: 'planned' },
      },
    })
  }
}
