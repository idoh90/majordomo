import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { CrewVisibility } from './shareTransport'
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

/** an application lodged with a vetted crew, and how it ended */
export interface CrewApplication {
  /** the code that was typed — the only name a waiting crew has */
  code: string
  /** the keeper said no (or the crew was disbanded) — shown until dismissed */
  declined?: boolean
}

interface ShareBookkeeping {
  /** per-share pull cursor (server clock, never ours) */
  cursors: Record<string, string | null>
  /** per-share join code, cached so the sheet can show it offline */
  codes: Record<string, string>
  /** per-share keeper (owner user id), cached with the code */
  owners: Record<string, string>
  /** per-share door policy, cached with the code so the sheet reads offline */
  visibilities: Record<string, CrewVisibility>
  /**
   * Per share: how many of the crew's rows this device legitimately does NOT
   * keep — refused as malformed, refused as not this crew's to speak for, or
   * of a record kind this build has never heard of.
   *
   * The repair signal ("more rows there than here means I lost some") assumed
   * the two counts should match. Once the fold started refusing records that
   * assumption became false, and the signal fired on EVERY cycle forever: one
   * junk record pushed by a crewmate, and the device re-pulled the entire crew
   * for good. The same would happen to any older build the day a new record
   * kind ships. Subtracting the known shortfall makes the signal mean what it
   * says again — and a genuinely lost row still widens the gap and still repairs.
   */
  unkept: Record<string, number>
  /** key → when this device noticed the change */
  dirty: Record<RecordKey, number>
  /** key → when this device was TOLD to delete it (never inferred) */
  tombstones: Record<RecordKey, number>
  /**
   * A code that arrived on a `?join=` link and has NOT been accepted yet.
   *
   * The distinction from `pendingJoin` is the whole point: this one is an
   * OFFER, and the app shows it and waits. Following a link used to put the
   * code straight into `pendingJoin`, which the service redeems on its next
   * cycle — so opening a link was joining, before the person had agreed to
   * anything or been told what agreeing meant.
   *
   * Persisted for the same reason `pendingJoin` is: accepting may need a
   * Google sign-in, and that leaves for another origin and returns to a fresh
   * page load which memory does not survive.
   */
  invite: string | null
  /** a join code ACCEPTED and waiting for sign-in + network — survives the redirect */
  pendingJoin: string | null
  /**
   * Crews this device has APPLIED to and is waiting on. A vetted crew tells
   * nobody its name until the keeper says yes, so the code is the whole of
   * what can be shown while waiting — and it is persisted because "I asked"
   * must survive closing the tab.
   *
   * A turned-away application is KEPT, flagged, until the user dismisses it.
   * An entry that simply vanished would leave someone who applied yesterday
   * with no way to tell a refusal from a crew they imagined applying to.
   */
  applications: Record<string, CrewApplication>
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
  setCode: (shareId: string, code: string, ownerId?: string, visibility?: CrewVisibility) => void
  /** the keeper changed the door policy — reflected now, confirmed on the pull */
  setVisibility: (shareId: string, visibility: CrewVisibility) => void
  /** measured after a full pull: the crew's rows this device does not keep */
  setUnkept: (shareId: string, n: number) => void
  /** an application lodged, flagged as refused, or cleared away */
  setApplication: (shareId: string, app: CrewApplication | null) => void
  /** a share this device no longer belongs to: its queue and cursor go */
  dropShare: (shareId: string) => void
  /** an invitation offered, accepted (moved to pendingJoin) or waved off */
  setInvite: (code: string | null) => void
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
      visibilities: {},
      unkept: {},
      dirty: {},
      tombstones: {},
      invite: null,
      pendingJoin: null,
      applications: {},
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
      setCode: (shareId, code, ownerId, visibility) =>
        set((s) => ({
          codes: { ...s.codes, [shareId]: code },
          owners: ownerId ? { ...s.owners, [shareId]: ownerId } : s.owners,
          visibilities: visibility
            ? { ...s.visibilities, [shareId]: visibility }
            : s.visibilities,
        })),

      setVisibility: (shareId, visibility) =>
        set((s) => ({ visibilities: { ...s.visibilities, [shareId]: visibility } })),

      setUnkept: (shareId, n) =>
        set((s) =>
          s.unkept[shareId] === n ? s : { unkept: { ...s.unkept, [shareId]: Math.max(0, n) } },
        ),

      setApplication: (shareId, app) =>
        set((s) => {
          if (app === null) {
            if (!(shareId in s.applications)) return s
            const applications = { ...s.applications }
            delete applications[shareId]
            return { applications }
          }
          return { applications: { ...s.applications, [shareId]: app } }
        }),

      dropShare: (shareId) =>
        set((s) => {
          const prefix = `share:${shareId}/`
          const cursors = { ...s.cursors }
          delete cursors[shareId]
          const codes = { ...s.codes }
          delete codes[shareId]
          const owners = { ...s.owners }
          delete owners[shareId]
          const visibilities = { ...s.visibilities }
          delete visibilities[shareId]
          const unkept = { ...s.unkept }
          delete unkept[shareId]
          const applications = { ...s.applications }
          delete applications[shareId]
          return {
            cursors,
            codes,
            owners,
            visibilities,
            unkept,
            applications,
            dirty: withoutPrefix(s.dirty, prefix),
            tombstones: withoutPrefix(s.tombstones, prefix),
            pendingPull: s.pendingPull.filter((id) => id !== shareId),
          }
        }),

      setInvite: (invite) => set({ invite }),
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
          visibilities: {},
          unkept: {},
          dirty: {},
          tombstones: {},
          invite: null,
          pendingJoin: null,
          applications: {},
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
        visibilities: s.visibilities,
        unkept: s.unkept,
        dirty: s.dirty,
        tombstones: s.tombstones,
        invite: s.invite,
        pendingJoin: s.pendingJoin,
        applications: s.applications,
        pendingPull: s.pendingPull,
      }),
    },
  ),
)
