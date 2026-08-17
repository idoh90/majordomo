import { useAuthStore } from '../../core/auth/store'
import { useEventsStore } from '../../core/events/store'
import { offReason } from '../../core/sync/gate'
import { noteDeleted } from '../../core/sync/intent'
import { shareRecordKey } from '../../core/sync/shareIntent'
import { useShareStore } from '../../core/sync/shareStore'
import {
  admitMember,
  createShare,
  deleteShare,
  setMemberRole,
  setShareVisibility,
  kickMember as wireKick,
  leaveShare as wireLeave,
  type CrewRole,
  type CrewVisibility,
} from '../../core/sync/shareTransport'
import { voice } from '../../core/voice'
import { fulfilledHours, metaOf, ventureOfEvent } from './lib'
import { useWorkshopStore } from './store'
import type { ShareMember, WorkEntry } from './types'

/**
 * The crew lifecycle — the deliberate acts: open a venture to a crew, join
 * one, leave, disband, remove a member. Ordinary edits never come through
 * here; they ride the engines. Everything here refuses politely when the
 * registry is unreachable, because these acts change who holds what and must
 * not half-happen.
 *
 * Lives in the module (module → core only); the app-floor service picks work
 * up through the share store's mailboxes.
 */

export type CrewResult = { ok: true; code?: string } | { ok: false; reason: string }

function gate(): string | null {
  const off = offReason()
  if (off === 'demo') return voice.workshop.crew.toast.demoOff
  if (off !== null) return voice.workshop.crew.toast.offline
  if (useAuthStore.getState().status !== 'signedIn') return voice.workshop.crew.toast.needsSignIn
  return null
}

function myLabel(): string {
  const email = useAuthStore.getState().email
  return email ? email.split('@')[0] : 'someone'
}

/** whether the crew doors should exist at all on this device */
export function crewsAvailable(): boolean {
  return offReason() === null
}

/* ------------------------------------------------------------------ ranks */

/**
 * What this account may do on a crew, read from the cached roster.
 *
 * Pure on purpose — components pass their own subscribed slices so the screen
 * re-renders when a rank changes. Two deliberate defaults:
 *
 *  · the KEEPER is `shares.owner_id`, cached beside the code, and it outranks
 *    whatever the roster row says. A roster that has not come down yet still
 *    knows who opened the venture.
 *  · a crew whose roster is not here yet reads `hand`, not `guest`. Being
 *    optimistic costs nothing — the registry refuses anything it shouldn't
 *    accept — while being pessimistic would lock a member out of their own
 *    board every time they opened it offline.
 */
export function crewRole(
  shareId: string | undefined,
  members: Record<string, ShareMember[]>,
  owners: Record<string, string>,
  me: string | null,
): CrewRole | null {
  if (!shareId || !me) return null
  if (owners[shareId] === me) return 'keeper'
  const row = (members[shareId] ?? []).find((m) => m.userId === me)
  if (!row) return 'hand'
  return row.status === 'pending' ? 'guest' : row.role
}

/** the same question from outside React — the sync loop's own guard */
export function crewRoleNow(shareId: string): CrewRole | null {
  return crewRole(
    shareId,
    useWorkshopStore.getState().members,
    useShareStore.getState().owners,
    useAuthStore.getState().userId,
  )
}

/** may this device put a hand on the crew's board? A guest never may. */
export function canWorkCrew(shareId: string): boolean {
  return crewRoleNow(shareId) !== 'guest'
}

/**
 * Open a venture to a crew.
 *
 * The order matters. The share is created FIRST (it can fail; nothing local
 * has moved). Then, in one breath: the venture takes its `shareId`, the
 * records that now travel through the share are buried in PERSONAL space
 * (declared intent — they moved namespaces, they did not die), the ledger is
 * backfilled from this device's own history, and every share-space record is
 * marked dirty by hand — the engine's start() deliberately baselines without
 * dirtying, so without this explicit seeding the initial push would silently
 * never happen.
 */
export async function shareVenture(ventureId: string): Promise<CrewResult> {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }

  let created: { id: string; code: string }
  try {
    created = await createShare(myLabel())
  } catch {
    return { ok: false, reason: voice.workshop.crew.toast.offline }
  }
  const shareId = created.id
  const me = useAuthStore.getState().userId
  // a crew opens with its door open — vetting is a thing the keeper turns ON
  useShareStore.getState().setCode(shareId, created.code, me ?? undefined, 'open')

  const ws = useWorkshopStore.getState()
  ws.updateVenture(ventureId, { shareId })

  // these records now travel through the crew — their personal cloud copies
  // are retired by intent. The venture record itself stays dual-homed, and
  // sessions were never anyone else's business.
  const cards = ws.cards.filter((c) => c.ventureId === ventureId)
  const threads = ws.threads.filter((t) => t.ventureId === ventureId)
  const milestones = ws.milestones.filter((m) => m.ventureId === ventureId)
  noteDeleted('workshop', 'card', cards.map((c) => c.id))
  noteDeleted('workshop', 'thread', threads.map((t) => t.id))
  noteDeleted('workshop', 'milestone', milestones.map((m) => m.id))

  // backfill the ledger from my own fulfilled history, so the crew's books
  // open with the hours already worked rather than at zero
  if (me) {
    const events = useEventsStore.getState().events
    const entries: Record<string, WorkEntry> = {}
    for (const e of events) {
      if (ventureOfEvent(e) !== ventureId) continue
      const h = fulfilledHours(e, metaOf(ws.sessions, e))
      if (h <= 0) continue
      entries[e.id] = { ventureId, at: e.start, h, by: me }
    }
    if (Object.keys(entries).length > 0) ws.upsertWorkEntries(entries)
  }

  // seed the initial push — every record the share source now emits
  const after = useWorkshopStore.getState()
  const keys = [
    shareRecordKey(shareId, 'venture', ventureId),
    ...after.cards.filter((c) => c.ventureId === ventureId).map((c) => shareRecordKey(shareId, 'card', c.id)),
    ...after.threads.filter((t) => t.ventureId === ventureId).map((t) => shareRecordKey(shareId, 'thread', t.id)),
    ...after.milestones.filter((m) => m.ventureId === ventureId).map((m) => shareRecordKey(shareId, 'milestone', m.id)),
    ...Object.entries(after.workEntries)
      .filter(([, en]) => en.ventureId === ventureId)
      .map(([key]) => shareRecordKey(shareId, 'work', key)),
  ]
  useShareStore.getState().markDirty(keys, Date.now())

  return { ok: true, code: created.code }
}

/**
 * Redeem a join code. The code goes into the persisted mailbox and the
 * service takes it from there — which is also exactly how a ?join link that
 * had to survive an OAuth redirect arrives, so both doors share one path.
 */
export function joinCrew(code: string): CrewResult {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }
  useShareStore.getState().setError(null)
  useShareStore.getState().setPendingJoin(code)
  return { ok: true }
}

/** Disband (keeper only): the share row goes, everyone keeps a private copy. */
export async function disbandCrew(ventureId: string): Promise<CrewResult> {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }
  const ws = useWorkshopStore.getState()
  const shareId = ws.ventures.find((v) => v.id === ventureId)?.shareId
  if (!shareId) return { ok: false, reason: voice.workshop.crew.toast.offline }
  try {
    await deleteShare(shareId)
  } catch {
    return { ok: false, reason: voice.workshop.crew.toast.offline }
  }
  // the venture is private again; its records re-enter the personal source,
  // the engine's scan marks them dirty, and the personal push repopulates
  ws.adoptPrivateCopy(shareId)
  useShareStore.getState().dropShare(shareId)
  return { ok: true }
}

/** Leave (member): my roster row goes; I keep a private copy of the venture. */
export async function leaveCrew(ventureId: string): Promise<CrewResult> {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }
  const ws = useWorkshopStore.getState()
  const shareId = ws.ventures.find((v) => v.id === ventureId)?.shareId
  const me = useAuthStore.getState().userId
  if (!shareId || !me) return { ok: false, reason: voice.workshop.crew.toast.offline }
  try {
    await wireLeave(shareId, me)
  } catch {
    return { ok: false, reason: voice.workshop.crew.toast.offline }
  }
  ws.adoptPrivateCopy(shareId)
  useShareStore.getState().dropShare(shareId)
  return { ok: true }
}

/**
 * Remove a member (keeper only). Their device notices and keeps a copy. The
 * same wire turns an applicant away — the roster row simply goes, and there is
 * no third state to record.
 */
export async function removeMember(shareId: string, userId: string): Promise<CrewResult> {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }
  try {
    await wireKick(shareId, userId)
  } catch {
    return { ok: false, reason: voice.workshop.crew.toast.offline }
  }
  // reflect it locally now; the next pull would anyway
  const ws = useWorkshopStore.getState()
  const roster = ws.members[shareId]
  if (roster) {
    ws.setMembers(shareId, roster.filter((m) => m.userId !== userId))
  }
  return { ok: true }
}

/* ------------------------------------------------------- the keeper's acts */

/**
 * The door policy. `open` — the code admits, which is how every crew starts.
 * `vetted` — the code applies and the keeper admits. Changing it never
 * disturbs anyone already on the roster: shutting the door does not turn out
 * the people inside, and opening it lets in whoever was already waiting (the
 * registry does that on their next knock).
 */
export async function setCrewPrivacy(
  shareId: string,
  visibility: CrewVisibility,
): Promise<CrewResult> {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }
  try {
    await setShareVisibility(shareId, visibility)
  } catch {
    return { ok: false, reason: voice.workshop.crew.toast.offline }
  }
  useShareStore.getState().setVisibility(shareId, visibility)
  return { ok: true }
}

/** Promote or demote (keeper only). The keeper's own row is refused upstream. */
export async function setCrewRole(
  shareId: string,
  userId: string,
  role: CrewRole,
): Promise<CrewResult> {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }
  try {
    await setMemberRole(shareId, userId, role)
  } catch {
    return { ok: false, reason: voice.workshop.crew.toast.offline }
  }
  patchMember(shareId, userId, { role })
  return { ok: true }
}

/** Admit an applicant (keeper only) — they are on the crew from this moment. */
export async function admitApplicant(shareId: string, userId: string): Promise<CrewResult> {
  const refused = gate()
  if (refused) return { ok: false, reason: refused }
  try {
    await admitMember(shareId, userId)
  } catch {
    return { ok: false, reason: voice.workshop.crew.toast.offline }
  }
  patchMember(shareId, userId, { status: 'active' })
  return { ok: true }
}

/** reflect a roster edit now; the next pull is what confirms it */
function patchMember(shareId: string, userId: string, patch: Partial<ShareMember>): void {
  const ws = useWorkshopStore.getState()
  const roster = ws.members[shareId]
  if (!roster) return
  ws.setMembers(
    shareId,
    roster.map((m) => (m.userId === userId ? { ...m, ...patch } : m)),
  )
}
