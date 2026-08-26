import { getClient } from '../auth/client'

/**
 * The crew wire. Knows the `shares` / `share_members` / `share_records`
 * tables and nothing else — no venture, no card, no payload shape. The exact
 * sibling of transport.ts, per share instead of per user.
 */

export interface ShareWireRecord {
  kind: string
  id: string
  payload: unknown
  deleted: boolean
  client_updated_at: string
  server_seen_at?: string
  /** who last wrote it — stamped by the RPC, informational on the way down */
  author_id?: string | null
}

/**
 * A crew's door policy. `open` — the code admits, which is all 0004 could do.
 * `vetted` — the code applies, and the keeper admits.
 */
export type CrewVisibility = 'open' | 'vetted'

/** what a hand on the crew may do. Enforced in the registry, not just drawn. */
export type CrewRole = 'keeper' | 'hand' | 'guest'

/**
 * Where someone stands with a crew.
 *
 * `left` and `removed` exist so that a RANK survives a departure. A roster row
 * is never deleted now: leaving used to be a DELETE, and since `join_share`
 * seats anyone it does not already know as a `hand`, a demoted guest could
 * leave and re-type the code to come back a writer, and a removed member could
 * walk straight back into an open crew. The row stays so the rank does.
 */
export type CrewStanding = 'pending' | 'active' | 'left' | 'removed'

/**
 * The share row as anyone on the roster may read it — and the join CODE is not
 * in it, on purpose. 0008 takes `code` out of the SELECT grant entirely: a
 * guest who could read it could hand it to a stranger, and `join_share` seats a
 * stranger as a HAND, so the rank that changes nothing could mint writers.
 * The keeper reads theirs through `shareCode()` below.
 */
export interface ShareInfo {
  id: string
  ownerId: string
  visibility: CrewVisibility
}

/** what `create_share` hands back, and the one moment a code arrives unasked */
export interface NewShare {
  id: string
  code: string
}

export interface MemberRow {
  userId: string
  label: string
  joinedAt: string
  role: CrewRole
  status: CrewStanding
}

/** the registry's word, defended: an unknown rank is the LEAST of them, so a
 *  future rank this build has never heard of can only ever look, never write */
const asRole = (v: unknown): CrewRole =>
  v === 'keeper' || v === 'hand' || v === 'guest' ? v : 'guest'
const asStanding = (v: unknown): CrewStanding =>
  v === 'pending' || v === 'left' || v === 'removed' ? v : 'active'
const asVisibility = (v: unknown): CrewVisibility => (v === 'vetted' ? 'vetted' : 'open')

/** Postgres refuses a batch that touches the same row twice; last write wins */
function dedupe(rows: ShareWireRecord[]): ShareWireRecord[] {
  const byKey = new Map<string, ShareWireRecord>()
  for (const r of rows) byKey.set(`${r.kind}/${r.id}`, r)
  return [...byKey.values()]
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/** open a venture to a crew — returns the share id and its join code */
export async function createShare(label: string): Promise<NewShare> {
  const client = getClient()
  if (!client) throw new Error('sync is off')
  const sb = await client
  const { data, error } = await sb.rpc('create_share', { p_label: label })
  if (error) throw new Error(error.message)
  const row = (data as Array<{ share_id: string; code: string }> | null)?.[0]
  if (!row) throw new Error('create_share returned nothing')
  return { id: row.share_id, code: row.code }
}

export interface JoinResult {
  shareId: string
  /** 'pending' on a vetted crew — the code applied rather than admitted */
  status: CrewStanding
}

/**
 * Redeem a code. The server normalizes what a human actually typed, and
 * answers with the standing it left us in — which on a vetted crew is
 * `pending` and means the keeper has been asked, not that anything failed.
 */
export async function joinShare(code: string, label: string): Promise<JoinResult> {
  const client = getClient()
  if (!client) throw new Error('sync is off')
  const sb = await client
  const { data, error } = await sb.rpc('join_share', { p_code: code, p_label: label })
  if (error) throw new Error(error.message)
  // `joined_share`, not `share_id` — see the note above join_share in
  // 0006_crew_roles.sql: an output column named after a real column makes the
  // function's own ON CONFLICT clause ambiguous and nobody can join at all
  const row = (data as Array<{ joined_share: string; member_status: string }> | null)?.[0]
  if (!row) throw new Error('join_share returned nothing')
  return { shareId: row.joined_share, status: asStanding(row.member_status) }
}

/**
 * The HOT push, per share. Same contract as pushHot: RPC for the LWW WHERE,
 * RETURNING is the accepted set, anything absent lost the argument and must
 * be re-pulled rather than assumed to have landed.
 */
export async function pushShareHot(
  shareId: string,
  rows: ShareWireRecord[],
): Promise<Set<string>> {
  const client = getClient()
  if (!client || rows.length === 0) return new Set()
  const sb = await client
  const accepted = new Set<string>()

  for (const batch of chunk(dedupe(rows), 400)) {
    const { data, error } = await sb.rpc('push_share_records', {
      p_share: shareId,
      rows: batch,
    })
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as Array<{ kind: string; id: string }>) {
      accepted.add(`${row.kind}/${row.id}`)
    }
  }
  return accepted
}

const OVERLAP_MS = 30_000
const PAGE = 1000

export interface SharePullResult {
  rows: ShareWireRecord[]
  cursor: string | null
}

export async function pullShare(shareId: string, since: string | null): Promise<SharePullResult> {
  const client = getClient()
  if (!client) return { rows: [], cursor: since }
  const sb = await client

  const from = since ? new Date(new Date(since).getTime() - OVERLAP_MS).toISOString() : null
  const rows: ShareWireRecord[] = []
  let cursor = since
  let page = 0

  for (;;) {
    let q = sb
      .from('share_records')
      .select('kind,id,payload,deleted,client_updated_at,server_seen_at,author_id')
      .eq('share_id', shareId)
      .order('server_seen_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    if (from) q = q.gte('server_seen_at', from)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    const batch = (data ?? []) as ShareWireRecord[]
    rows.push(...batch)
    for (const r of batch) {
      if (r.server_seen_at && (!cursor || r.server_seen_at > cursor)) cursor = r.server_seen_at
    }
    if (batch.length < PAGE) break
    page += 1
  }

  return { rows, cursor }
}

/** the repair signal, per share — live records the crew registry still holds */
export async function countShareRecords(shareId: string): Promise<number | null> {
  const client = getClient()
  if (!client) return null
  const sb = await client
  const { count, error } = await sb
    .from('share_records')
    .select('*', { count: 'exact', head: true })
    .eq('share_id', shareId)
    .eq('deleted', false)
  if (error) throw new Error(error.message)
  return count ?? null
}

export interface Memberships {
  /** crews this account is on */
  active: string[]
  /** crews it has applied to and is waiting on */
  pending: string[]
}

/**
 * Every crew this account has a roster row in — RLS scopes it, and since an
 * applicant may read their own row, a standing comes back with each. One
 * query answers both "which crews are mine" and "which am I still waiting on",
 * which is why the service never has to ask a second time.
 */
export async function listMemberships(): Promise<Memberships> {
  const client = getClient()
  if (!client) return { active: [], pending: [] }
  const sb = await client
  const { data, error } = await sb.from('share_members').select('share_id,status')
  if (error) throw new Error(error.message)
  const active = new Set<string>()
  const pending = new Set<string>()
  for (const r of (data ?? []) as Array<{ share_id: string; status: string }>) {
    // `left` and `removed` are in NEITHER list: the row is kept so the rank
    // survives, not because this device still belongs to the crew
    const standing = asStanding(r.status)
    if (standing === 'pending') pending.add(r.share_id)
    else if (standing === 'active') active.add(r.share_id)
  }
  return { active: [...active], pending: [...pending] }
}

export async function listMembers(shareId: string): Promise<MemberRow[]> {
  const client = getClient()
  if (!client) return []
  const sb = await client
  const { data, error } = await sb
    .from('share_members')
    .select('user_id,label,joined_at,role,status')
    .eq('share_id', shareId)
  if (error) throw new Error(error.message)
  return (
    (data ?? []) as Array<{
      user_id: string
      label: string
      joined_at: string
      role: string
      status: string
    }>
  ).map((r) => ({
    userId: r.user_id,
    label: r.label,
    joinedAt: r.joined_at,
    role: asRole(r.role),
    status: asStanding(r.status),
  }))
}

/** the share row itself — who keeps it and its door policy. Not the code. */
export async function getShare(shareId: string): Promise<ShareInfo | null> {
  const client = getClient()
  if (!client) return null
  const sb = await client
  const { data, error } = await sb
    .from('shares')
    .select('id,owner_id,visibility')
    .eq('id', shareId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as { id: string; owner_id: string; visibility: string }
  return {
    id: row.id,
    ownerId: row.owner_id,
    visibility: asVisibility(row.visibility),
  }
}

/**
 * The keeper's own view of the code. Answers null for anyone else — the
 * function is DEFINER and filters on `owner_id = auth.uid()`, so "not yours"
 * and "no such crew" are the same empty answer and neither is an error.
 */
export async function shareCode(shareId: string): Promise<string | null> {
  const client = getClient()
  if (!client) return null
  const sb = await client
  const { data, error } = await sb.rpc('share_code', { p_share: shareId })
  if (error) throw new Error(error.message)
  return typeof data === 'string' && data !== '' ? data : null
}

/**
 * Turn the lock. Keeper only (the registry says so, not this function), and it
 * evicts nobody: standing lives on the roster and is never re-derived from the
 * code, so the crew wakes up unchanged and only the old links stop working.
 */
export async function rotateShareCode(shareId: string): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('sync is off')
  const sb = await client
  const { data, error } = await sb.rpc('rotate_share_code', { p_share: shareId })
  if (error) throw new Error(error.message)
  if (typeof data !== 'string' || data === '') throw new Error('rotate_share_code returned nothing')
  return data
}

/**
 * Change the name THIS account is listed under on one crew.
 *
 * It used to be done by re-knocking with the join code, whose ON CONFLICT
 * branch updates the label — clever, and it worked only because every member
 * held the code. After 0008 they do not, so a rename gets its own narrow door:
 * one column, one row, chosen by the registry from auth.uid() rather than from
 * an argument, exactly like `leave_share`.
 */
export async function renameMember(shareId: string, label: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb.rpc('rename_member', { p_share: shareId, p_label: label })
  if (error) throw new Error(error.message)
}

/**
 * The keeper's three verbs, all plain DML: the door policy, a rank, and
 * admitting an applicant. No RPC, because RLS plus the column grants in 0006
 * already say exactly who may write which column — an RPC would only be a
 * second place for that rule to drift.
 */
export async function setShareVisibility(
  shareId: string,
  visibility: CrewVisibility,
): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb.from('shares').update({ visibility }).eq('id', shareId)
  if (error) throw new Error(error.message)
}

export async function setMemberRole(
  shareId: string,
  userId: string,
  role: CrewRole,
): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb
    .from('share_members')
    .update({ role })
    .eq('share_id', shareId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/** admit an applicant. Declining is `kickMember` — the row simply goes. */
export async function admitMember(shareId: string, userId: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb
    .from('share_members')
    .update({ status: 'active' })
    .eq('share_id', shareId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/**
 * Leaving marks the row `left`; it does not delete it (0007). An RPC rather
 * than plain DML because a member must be able to change ONE column of their
 * own row, and a policy wide enough to allow that would be wide enough to let
 * them write their own `role` — RLS has no column granularity.
 */
export async function leaveShare(shareId: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb.rpc('leave_share', { p_share: shareId })
  if (error) throw new Error(error.message)
}

/**
 * Removing someone, and turning an applicant away, are the same act: the row
 * stands, marked `removed`, and the code will not let them back in. Deleting
 * it would erase the rank along with the person.
 */
export async function kickMember(shareId: string, userId: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb
    .from('share_members')
    .update({ status: 'removed' })
    .eq('share_id', shareId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/** disband: the share row cascades members and records away */
export async function deleteShare(shareId: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb.from('shares').delete().eq('id', shareId)
  if (error) throw new Error(error.message)
}

/**
 * Realtime is a HINT, never a transport — the callback pulls; payloads are
 * never applied off the socket. One channel per share, on both the records
 * and the roster (a kick should be noticed without waiting for a push to be
 * refused).
 */
export function subscribeShareRealtime(shareId: string, onHint: () => void): () => void {
  const client = getClient()
  if (!client) return () => {}

  let dispose = () => {}
  let cancelled = false

  void client.then((sb) => {
    if (cancelled) return
    const channel = sb
      .channel(`share-${shareId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'share_records', filter: `share_id=eq.${shareId}` },
        () => onHint(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'share_members', filter: `share_id=eq.${shareId}` },
        () => onHint(),
      )
      .subscribe()
    dispose = () => {
      void sb.removeChannel(channel)
    }
  })

  return () => {
    cancelled = true
    dispose()
  }
}
