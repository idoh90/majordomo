import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { RecordKey } from './types'

/**
 * `majordomo-share` v1 — the crew registry's own bookkeeping, the exact twin
 * of `majordomo-sync` for the shared spaces. Device-local, deliberately NOT
 * part of the estate (not in ESTATE_KEYS): one device's queue is meaningless
 * on another.
 *
 * Keys use the wing `share:<shareId>` — `parseKey` splits on '/', so the ':'
 * costs nothing, and the prefix is what lets one share's queue be dropped
 * without touching its neighbours.
 *
 * The one field with no `majordomo-sync` twin is `pendingJoin`: a code from a
 * `?join=` link, PERSISTED because redeeming it may require a Google sign-in
 * first, and `signInWithOAuth` leaves for another origin and returns to a
 * fresh page load — memory does not survive that trip; localStorage does.
 */

interface ShareBookkeeping {
  /** per-share pull cursor (server clock, never ours) */
  cursors: Record<string, string | null>
  /** per-share join code, cached so the sheet can show it offline */
  codes: Record<string, string>
  /** per-share keeper (owner user id), cached with the code */
  owners: Record<string, string>
  /** key → when this device noticed the change */
  dirty: Record<RecordKey, number>
  /** key → when this device was TOLD to delete it (never inferred) */
  tombstones: Record<RecordKey, number>
  /** a join code waiting for sign-in + network — survives the OAuth redirect */
  pendingJoin: string | null
  /** share ids a wing has asked the service to pull now — the mailbox that
   *  keeps modules/ from importing app/ */
  pendingPull: string[]

  /* --- transient: this moment, not this device --- */
  busy: boolean
  lastError: string | null

  markDirty: (keys: RecordKey[], at: number) => void
  markDeleted: (keys: RecordKey[], at: number) => void
  clearPending: (keys: RecordKey[]) => void
  setCursor: (shareId: string, cursor: string | null) => void
  setCode: (shareId: string, code: string, ownerId?: string) => void
  /** a share this device no longer belongs to: its queue and cursor go */
  dropShare: (shareId: string) => void
  setPendingJoin: (code: string | null) => void
  requestPull: (shareId: string) => void
  clearPull: (shareId: string) => void
  setBusy: (busy: boolean) => void
  setError: (lastError: string | null) => void
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

const withoutPrefix = (map: Record<string, number>, prefix: string): Record<string, number> => {
  const kept = Object.entries(map).filter(([k]) => !k.startsWith(prefix))
  if (kept.length === Object.keys(map).length) return map
  return Object.fromEntries(kept)
}

export const useShareStore = create<ShareBookkeeping>()(
  persist(
    (set) => ({
      cursors: {},
      codes: {},
      owners: {},
      dirty: {},
      tombstones: {},
      pendingJoin: null,
      pendingPull: [],
      busy: false,
      lastError: null,

      markDirty: (keys, at) =>
        set((s) => {
          if (keys.length === 0) return s
          const dirty = { ...s.dirty }
          for (const k of keys) dirty[k] = at
          // a record that exists again is not a deleted record
          return { dirty, tombstones: omit(s.tombstones, keys) }
        }),

      markDeleted: (keys, at) =>
        set((s) => {
          if (keys.length === 0) return s
          const tombstones = { ...s.tombstones }
          for (const k of keys) tombstones[k] = at
          return { tombstones, dirty: omit(s.dirty, keys) }
        }),

      clearPending: (keys) =>
        set((s) =>
          keys.length === 0
            ? s
            : { dirty: omit(s.dirty, keys), tombstones: omit(s.tombstones, keys) },
        ),

      setCursor: (shareId, cursor) =>
        set((s) => ({ cursors: { ...s.cursors, [shareId]: cursor } })),
      setCode: (shareId, code, ownerId) =>
        set((s) => ({
          codes: { ...s.codes, [shareId]: code },
          owners: ownerId ? { ...s.owners, [shareId]: ownerId } : s.owners,
        })),

      dropShare: (shareId) =>
        set((s) => {
          const prefix = `share:${shareId}/`
          const cursors = { ...s.cursors }
          delete cursors[shareId]
          const codes = { ...s.codes }
          delete codes[shareId]
          const owners = { ...s.owners }
          delete owners[shareId]
          return {
            cursors,
            codes,
            owners,
            dirty: withoutPrefix(s.dirty, prefix),
            tombstones: withoutPrefix(s.tombstones, prefix),
            pendingPull: s.pendingPull.filter((id) => id !== shareId),
          }
        }),

      setPendingJoin: (pendingJoin) => set({ pendingJoin }),
      requestPull: (shareId) =>
        set((s) =>
          s.pendingPull.includes(shareId) ? s : { pendingPull: [...s.pendingPull, shareId] },
        ),
      clearPull: (shareId) =>
        set((s) => ({ pendingPull: s.pendingPull.filter((id) => id !== shareId) })),

      setBusy: (busy) => set({ busy }),
      setError: (lastError) => set({ lastError }),
      reset: () =>
        set({
          cursors: {},
          codes: {},
          owners: {},
          dirty: {},
          tombstones: {},
          pendingJoin: null,
          pendingPull: [],
          lastError: null,
        }),
    }),
    {
      name: 'majordomo-share',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // `busy` and `lastError` describe this moment, not this device
      partialize: (s) => ({
        cursors: s.cursors,
        codes: s.codes,
        owners: s.owners,
        dirty: s.dirty,
        tombstones: s.tombstones,
        pendingJoin: s.pendingJoin,
        pendingPull: s.pendingPull,
      }),
    },
  ),
)
