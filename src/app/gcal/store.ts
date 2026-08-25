import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The Google bridge's device-local bookkeeping — `majordomo-gcal`.
 *
 * Deliberately NOT estate: never in `ESTATE_KEYS` (an export must not carry
 * sync ledgers), never a sync source (which Google events this device has
 * already carried across is a fact about this device, exactly like the
 * `majordomo-sync` queue it is modelled on). No credential lives here either —
 * access tokens are module memory in service.ts and die with the tab; the
 * refresh token never leaves the server.
 *
 * `pushed` is the push ledger: localId → the `updatedAt` last confirmed at
 * Google. It may only ever UNDER-claim (entries advance on confirmed writes
 * alone), so a crash mid-cycle re-pushes idempotently rather than losing an
 * edit. An entry whose event no longer exists in the committed store is the
 * deletion signal — map-vs-store absence, never a diff of Google's listing.
 */

interface GcalConnection {
  email: string | null
  /** the app-created "Majordomo" calendar at Google — null until first push */
  calendarId: string | null
}

interface GcalState {
  /** whose bookkeeping this is — a different account resets it (sync's guard) */
  ownerId: string | null
  /** cached answer of the server's `status` — null = not connected (or never asked) */
  connected: GcalConnection | null
  /** the two directions, each its own tap */
  pullOn: boolean
  pushOn: boolean
  /** localId → updatedAt last confirmed at Google */
  pushed: Record<string, string>
  lastSyncAt: string | null
  /** the refresh grant lapsed — the fix is the consent door again */
  needsReconnect: boolean

  /* transient — never persisted */
  busy: boolean
  lastError: string | null
  /** a neutral line (e.g. "connected") — errors go in lastError */
  notice: string | null

  setOwner: (id: string | null) => void
  setConnected: (c: GcalConnection | null) => void
  setPullOn: (on: boolean) => void
  setPushOn: (on: boolean) => void
  notePushed: (entries: Record<string, string>) => void
  dropPushed: (ids: string[]) => void
  setLastSync: (iso: string) => void
  setNeedsReconnect: (v: boolean) => void
  setBusy: (v: boolean) => void
  setError: (msg: string | null) => void
  setNotice: (msg: string | null) => void
  /** forget everything, including the connection cache — disconnect / new owner */
  reset: () => void
}

export const useGcalStore = create<GcalState>()(
  persist(
    (set) => ({
      ownerId: null,
      connected: null,
      pullOn: true,
      pushOn: true,
      pushed: {},
      lastSyncAt: null,
      needsReconnect: false,

      busy: false,
      lastError: null,
      notice: null,

      setOwner: (id) => set({ ownerId: id }),
      setConnected: (c) => set({ connected: c }),
      setPullOn: (on) => set({ pullOn: on }),
      setPushOn: (on) => set({ pushOn: on }),
      notePushed: (entries) => set((s) => ({ pushed: { ...s.pushed, ...entries } })),
      dropPushed: (ids) =>
        set((s) => {
          const next = { ...s.pushed }
          for (const id of ids) delete next[id]
          return { pushed: next }
        }),
      setLastSync: (iso) => set({ lastSyncAt: iso }),
      setNeedsReconnect: (v) => set({ needsReconnect: v }),
      setBusy: (v) => set({ busy: v }),
      setError: (msg) => set({ lastError: msg }),
      setNotice: (msg) => set({ notice: msg }),
      reset: () =>
        set({
          ownerId: null,
          connected: null,
          pushed: {},
          lastSyncAt: null,
          needsReconnect: false,
          lastError: null,
          notice: null,
        }),
    }),
    {
      name: 'majordomo-gcal',
      version: 1,
      partialize: (s) => ({
        ownerId: s.ownerId,
        connected: s.connected,
        pullOn: s.pullOn,
        pushOn: s.pushOn,
        pushed: s.pushed,
        lastSyncAt: s.lastSyncAt,
        needsReconnect: s.needsReconnect,
      }),
    },
  ),
)
