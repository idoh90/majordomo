import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { localDayKey } from '../dates'
import { noteDeleted } from '../sync/intent'
import * as nightLib from './lib'
import { DEFAULT_TARGET_H } from './lib'
import type { SleepNote } from './types'

/**
 * THE NIGHT's own blob — `majordomo-sleep`.
 *
 * Small on purpose. The nights themselves are calendar events; what is kept
 * here is the optional extras keyed by event id (the Study's session-meta
 * split) and the three preferences that change what the figures MEAN.
 *
 * The split between what syncs and what does not follows the house rule: a
 * fact about the estate travels, a fact about one screen stays.
 *   · `targetH` and `coupling` change every number the system prints, so they
 *     are estate and they sync (see app/sync/registry.ts).
 *   · `morningPrompt` and `askedOn` are about whether one device puts a card
 *     in front of you at breakfast — device facts, exactly like panelTips.
 */
interface SleepState {
  /** event id → the extras that night was given */
  notes: Record<string, SleepNote>
  /** hours a night the estate measures against */
  targetH: number
  /** let sleep slow (or quicken) the Grounds' recovery clock */
  coupling: boolean
  /** offer to write down last night on a morning that has none */
  morningPrompt: boolean
  /** the local day the offer was last waved off — never begs twice in a day */
  askedOn: string | null

  noteNight: (eventId: string, patch: Partial<Omit<SleepNote, 'loggedAt'>>) => void
  clearNight: (eventId: string) => void
  setTarget: (h: number) => void
  setCoupling: (on: boolean) => void
  setMorningPrompt: (on: boolean) => void
  declineToday: (now: number) => void
  /** drop extras whose event is gone — local sweep only, never a deletion */
  pruneNotes: (liveIds: Set<string>) => void
}

export const useSleepStore = create<SleepState>()(
  persist(
    (set) => ({
      notes: {},
      targetH: DEFAULT_TARGET_H,
      coupling: true,
      morningPrompt: true,
      askedOn: null,

      noteNight: (eventId, patch) =>
        set((s) => {
          const prev = s.notes[eventId]
          const next: SleepNote = {
            ...prev,
            ...patch,
            loggedAt: prev?.loggedAt ?? new Date().toISOString(),
          }
          // an entry that carries nothing but its stamp is not worth keeping —
          // the night's hours live on the event, and an empty note here would
          // be a row synced between devices to say nothing
          if (next.rest === undefined && !next.awakeMin) {
            if (!prev) return s
            const { [eventId]: _gone, ...rest } = s.notes
            return { notes: rest }
          }
          return { notes: { ...s.notes, [eventId]: next } }
        }),

      // an explicit removal, and therefore a DECLARED deletion — the estate's
      // one rule about tombstones (core/sync/intent.ts): diff for upserts,
      // intent for deletions, and only from the action that knows why
      clearNight: (eventId) =>
        set((s) => {
          if (!s.notes[eventId]) return s
          const { [eventId]: _gone, ...rest } = s.notes
          noteDeleted('night', 'note', [eventId])
          return { notes: rest }
        }),

      // a target of nothing is a target nobody is measured against, which is a
      // legitimate answer — the surfaces drop their reference lines instead
      setTarget: (h) => set({ targetH: Math.min(14, Math.max(0, Math.round(h * 4) / 4)) }),
      setCoupling: (coupling) => set({ coupling }),
      setMorningPrompt: (morningPrompt) => set({ morningPrompt }),
      declineToday: (now) => set({ askedOn: localDayKey(new Date(now)) }),

      /**
       * Local garbage collection, and it MUST NEVER record a deletion — the
       * Study's pruneSessions says why at length and the reason is identical
       * here: a note can arrive from another device before the event it
       * belongs to, and burying it would destroy a real rating nobody asked
       * to lose. Orphans are provably inert (every figure walks sleep EVENTS
       * and looks a note up by id), so they cost a few bytes and nothing else.
       */
      pruneNotes: (liveIds) =>
        set((s) => {
          const keys = Object.keys(s.notes)
          if (keys.every((k) => liveIds.has(k))) return s
          const kept: Record<string, SleepNote> = {}
          for (const k of keys) if (liveIds.has(k)) kept[k] = s.notes[k]
          return { notes: kept }
        }),
    }),
    {
      name: 'majordomo-sleep',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        notes: s.notes,
        targetH: s.targetH,
        coupling: s.coupling,
        morningPrompt: s.morningPrompt,
        askedOn: s.askedOn,
      }),
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__sleep = useSleepStore
  // the pure model, on the strain engine's precedent (window.__engine): the
  // night harness scores attributions and debts without a React round-trip
  ;(window as unknown as Record<string, unknown>).__night = nightLib

  // ?demo hangs ratings off the fortnight of nights the events store seeds
  // (`demo-night-<n>` — see its own DEV block). Only some nights carry one:
  // the rating is optional in the product and a fixture where every night has
  // one would hide what an unrated night looks like. Two carry a spell awake,
  // which is what makes "in bed" and "asleep" visibly different figures.
  if (
    new URLSearchParams(window.location.search).has('demo') &&
    Object.keys(useSleepStore.getState().notes).length === 0
  ) {
    const RATINGS: Record<string, { rest?: number; awakeMin?: number }> = {
      'demo-night-0': { rest: 4 },
      'demo-night-1': { rest: 3 },
      'demo-night-2': { rest: 2, awakeMin: 35 },
      'demo-night-3': { rest: 2 },
      'demo-night-4': { rest: 5 },
      'demo-night-6': { rest: 4 },
      'demo-night-7': { rest: 2 },
      'demo-night-8': { rest: 1, awakeMin: 50 },
      'demo-night-10': { rest: 3 },
      'demo-night-11': { rest: 3 },
    }
    const stamp = new Date().toISOString()
    useSleepStore.setState({
      notes: Object.fromEntries(
        Object.entries(RATINGS).map(([id, n]) => [id, { ...n, loggedAt: stamp }]),
      ),
    })
  }
}
