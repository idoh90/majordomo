import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { RecordKey } from './types'

/**
 * `majordomo-sync` v1 — the registry's own bookkeeping. Device-local, tiny
 * (~200 bytes at rest), and deliberately NOT part of the estate: it is not in
 * ESTATE_KEYS, because carrying one device's queue to another would be
 * meaningless at best.
 *
 * What it holds is only what must survive a reload:
 *
 *   dirty / tombstones  UNSENT work. Cleared the moment the registry accepts
 *                       them. A queue that does not survive being closed is not
 *                       a queue, and the whole point is that an edit made on a
 *                       plane still arrives.
 *   ownerId             which account this device last answered to, so signing
 *                       in as someone else cannot silently merge two estates.
 *   cursor              how far the last pull got (server clock, never ours).
 *   adopted             whether this device has completed its one-time
 *                       insert-only reconcile for `ownerId`.
 *
 * What it deliberately does NOT hold is the payload snapshot. That lives in
 * memory only — see engine.ts, which explains why keeping it here would be both
 * ~300-500 KB of a 5 MB budget and a way to manufacture false deletions.
 */

interface SyncState {
  ownerId: string | null
  cursor: string | null
  adopted: boolean
  /** key → when this device noticed the change */
  dirty: Record<RecordKey, number>
  /** key → when this device was TOLD to delete it (never inferred) */
  tombstones: Record<RecordKey, number>

  /** when the registry last accepted everything this device was carrying */
  lastCarriedAt: string | null

  /* --- transient: never persisted, because a stale "carrying…" across a
     reload would be a lie the app tells about work it is not doing --- */
  busy: boolean
  /** last transport failure, in the user's words; cleared on the next attempt */
  lastError: string | null
  /**
   * Set when a device signs in and BOTH it and the registry already hold
   * records. Two estates meeting for the first time is the one moment where
   * merging silently could be the wrong answer, so the loop stops and asks.
   */
  pendingChoice: { local: number; cloud: number } | null

  markDirty: (keys: RecordKey[], at: number) => void
  markDeleted: (keys: RecordKey[], at: number) => void
  /** the registry accepted these — stop carrying them */
  clearPending: (keys: RecordKey[]) => void
  setOwner: (ownerId: string | null) => void
  setCursor: (cursor: string | null) => void
  setAdopted: (adopted: boolean) => void
  setBusy: (busy: boolean) => void
  setError: (lastError: string | null) => void
  setCarried: (at: string) => void
  setPendingChoice: (pendingChoice: { local: number; cloud: number } | null) => void
  /** sign-out: forget the bookkeeping, keep the estate */
  reset: () => void
}

const omit = (map: Record<string, number>, keys: readonly string[]): Record<string, number> => {
  let touched = false
  const next: Record<string, number> = {}
  for (const [k, v] of Object.entries(map)) {
    if (keys.includes(k)) {
      touched = true
      continue
    }
    next[k] = v
  }
  return touched ? next : map
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      ownerId: null,
      cursor: null,
      adopted: false,
      dirty: {},
      tombstones: {},
      lastCarriedAt: null,
      busy: false,
      lastError: null,
      pendingChoice: null,

      markDirty: (keys, at) =>
        set((s) => {
          if (keys.length === 0) return s
          const dirty = { ...s.dirty }
          for (const k of keys) dirty[k] = at
          // a record that exists again is not a deleted record: a re-created id
          // must not carry its own tombstone alongside it
          return { dirty, tombstones: omit(s.tombstones, keys) }
        }),

      markDeleted: (keys, at) =>
        set((s) => {
          if (keys.length === 0) return s
          const tombstones = { ...s.tombstones }
          for (const k of keys) tombstones[k] = at
          // no sense pushing an upsert for something we are about to bury
          return { tombstones, dirty: omit(s.dirty, keys) }
        }),

      clearPending: (keys) =>
        set((s) =>
          keys.length === 0
            ? s
            : { dirty: omit(s.dirty, keys), tombstones: omit(s.tombstones, keys) },
        ),

      setOwner: (ownerId) => set({ ownerId }),
      setCursor: (cursor) => set({ cursor }),
      setAdopted: (adopted) => set({ adopted }),
      setBusy: (busy) => set({ busy }),
      setError: (lastError) => set({ lastError }),
      setCarried: (at) => set({ lastCarriedAt: at }),
      setPendingChoice: (pendingChoice) => set({ pendingChoice }),
      reset: () =>
        set({
          ownerId: null,
          cursor: null,
          adopted: false,
          dirty: {},
          tombstones: {},
          lastCarriedAt: null,
          lastError: null,
          pendingChoice: null,
        }),
    }),
    {
      name: 'majordomo-sync',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // `busy`, `lastError` and `pendingChoice` are deliberately absent — they
      // describe this moment, not this device. A question left unanswered must
      // be asked again from a known state, never restored half-asked.
      partialize: (s) => ({
        ownerId: s.ownerId,
        cursor: s.cursor,
        adopted: s.adopted,
        dirty: s.dirty,
        tombstones: s.tombstones,
        lastCarriedAt: s.lastCarriedAt,
      }),
    },
  ),
)
