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

export interface ShareInfo {
  id: string
  code: string
  ownerId: string
}

export interface MemberRow {
  userId: string
  label: string
  joinedAt: string
}

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
export async function createShare(label: string): Promise<ShareInfo> {
  const client = getClient()
  if (!client) throw new Error('sync is off')
  const sb = await client
  const { data, error } = await sb.rpc('create_share', { p_label: label })
  if (error) throw new Error(error.message)
  const row = (data as Array<{ share_id: string; code: string }> | null)?.[0]
  if (!row) throw new Error('create_share returned nothing')
  return { id: row.share_id, code: row.code, ownerId: '' }
}

/** redeem a code — the server normalizes what a human actually typed */
export async function joinShare(code: string, label: string): Promise<string> {
  const client = getClient()
  if (!client) throw new Error('sync is off')
  const sb = await client
  const { data, error } = await sb.rpc('join_share', { p_code: code, p_label: label })
  if (error) throw new Error(error.message)
  return data as string
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

/** every crew this account belongs to — RLS scopes the rows */
export async function listMemberships(): Promise<string[]> {
  const client = getClient()
  if (!client) return []
  const sb = await client
  const { data, error } = await sb.from('share_members').select('share_id')
  if (error) throw new Error(error.message)
  const mine = new Set<string>()
  for (const r of (data ?? []) as Array<{ share_id: string }>) mine.add(r.share_id)
  return [...mine]
}

export async function listMembers(shareId: string): Promise<MemberRow[]> {
  const client = getClient()
  if (!client) return []
  const sb = await client
  const { data, error } = await sb
    .from('share_members')
    .select('user_id,label,joined_at')
    .eq('share_id', shareId)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<{ user_id: string; label: string; joined_at: string }>).map(
    (r) => ({ userId: r.user_id, label: r.label, joinedAt: r.joined_at }),
  )
}

/** the share row itself — who keeps it, and the code to hand out */
export async function getShare(shareId: string): Promise<ShareInfo | null> {
  const client = getClient()
  if (!client) return null
  const sb = await client
  const { data, error } = await sb
    .from('shares')
    .select('id,code,owner_id')
    .eq('id', shareId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as { id: string; code: string; owner_id: string }
  return { id: row.id, code: row.code, ownerId: row.owner_id }
}

/** leaving is deleting your own roster row — plain DML under RLS */
export async function leaveShare(shareId: string, userId: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb
    .from('share_members')
    .delete()
    .eq('share_id', shareId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

/** kicking is the owner deleting someone else's — the policy checks who asks */
export async function kickMember(shareId: string, userId: string): Promise<void> {
  const client = getClient()
  if (!client) return
  const sb = await client
  const { error } = await sb
    .from('share_members')
    .delete()
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
