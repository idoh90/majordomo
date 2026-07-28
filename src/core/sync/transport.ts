import { getClient } from '../auth/client'

/**
 * The wire. Knows the `records` table and nothing else — no wing, no kind, no
 * payload shape. Everything domain-specific lives above this.
 */

export interface WireRecord {
  wing: string
  kind: string
  id: string
  payload: unknown
  deleted: boolean
  client_updated_at: string
  server_seen_at?: string
}

/** Postgres refuses a batch that touches the same row twice; last write wins */
function dedupe(rows: WireRecord[]): WireRecord[] {
  const byKey = new Map<string, WireRecord>()
  for (const r of rows) byKey.set(`${r.wing}/${r.kind}/${r.id}`, r)
  return [...byKey.values()]
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/**
 * The HOT push: records this device watched change while it was running, so its
 * clock is worth something. Goes through the RPC because PostgREST cannot put a
 * WHERE on a conflict clause, and that WHERE is the entire point — it is the
 * guard that stops a stale device overwriting a newer record.
 *
 * Returns the keys the server ACCEPTED. Anything missing from that set lost the
 * comparison and must be re-pulled rather than assumed to have landed.
 */
export async function pushHot(rows: WireRecord[]): Promise<Set<string>> {
  const client = getClient()
  if (!client || rows.length === 0) return new Set()
  const sb = await client
  const accepted = new Set<string>()

  for (const batch of chunk(dedupe(rows), 400)) {
    const { data, error } = await sb.rpc('push_records', { rows: batch })
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as Array<{ wing: string; kind: string; id: string }>) {
      accepted.add(`${row.wing}/${row.kind}/${row.id}`)
    }
  }
  return accepted
}

/**
 * The COLD push: this device has no idea when its records were really edited —
 * a fresh sign-in, a restored backup, a cleared queue. Its clock is worthless,
 * so it is not allowed to win an argument. Insert-if-absent, never overwrite.
 *
 * That single rule is what makes first sign-in safe: adopting an estate into an
 * account can only ever ADD, so nothing already in the cloud can be trampled by
 * a device that just woke up believing it knew better.
 */
export async function pushCold(rows: WireRecord[]): Promise<void> {
  const client = getClient()
  if (!client || rows.length === 0) return
  const sb = await client

  for (const batch of chunk(dedupe(rows), 400)) {
    const { error } = await sb
      .from('records')
      .upsert(batch, { onConflict: 'user_id,wing,kind,id', ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }
}

/** a pull is idempotent, so overlapping the window costs nothing and missing a
 *  row that shared a timestamp with the cursor costs a silent divergence */
const OVERLAP_MS = 30_000
const PAGE = 1000

export interface PullResult {
  rows: WireRecord[]
  /** the newest server_seen_at seen, to store as the next cursor */
  cursor: string | null
}

export async function pull(since: string | null): Promise<PullResult> {
  const client = getClient()
  if (!client) return { rows: [], cursor: since }
  const sb = await client

  const from = since ? new Date(new Date(since).getTime() - OVERLAP_MS).toISOString() : null
  const rows: WireRecord[] = []
  let cursor = since
  let page = 0

  for (;;) {
    let q = sb
      .from('records')
      .select('wing,kind,id,payload,deleted,client_updated_at,server_seen_at')
      .order('server_seen_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1)
    // row-level security already scopes this to the signed-in user
    if (from) q = q.gte('server_seen_at', from)

    const { data, error } = await q
    if (error) throw new Error(error.message)

    const batch = (data ?? []) as WireRecord[]
    rows.push(...batch)
    for (const r of batch) {
      if (r.server_seen_at && (!cursor || r.server_seen_at > cursor)) cursor = r.server_seen_at
    }
    if (batch.length < PAGE) break
    page += 1
  }

  return { rows, cursor }
}

/**
 * How many live records the registry holds.
 *
 * This is the repair signal. An incremental cursor can only ever bring what
 * changed SINCE it — so a device that lost records locally (a corrupt blob, a
 * cleared store) would never learn they still exist, because nothing about them
 * changed server-side. Comparing counts costs one cheap query and answers the
 * only question that matters: does the registry hold more than we do?
 *
 * If it does, we pull from the beginning and the missing records come home.
 * This is the other half of "when in doubt, resurrect" — intent.ts refuses to
 * bury them, and this goes and fetches them back.
 */
export async function countRecords(): Promise<number | null> {
  const client = getClient()
  if (!client) return null
  const sb = await client
  const { count, error } = await sb
    .from('records')
    .select('*', { count: 'exact', head: true })
    .eq('deleted', false)
  if (error) throw new Error(error.message)
  return count ?? null
}

/**
 * Realtime is a HINT, never a transport.
 *
 * The callback is told only that something changed; it responds by pulling.
 * Applying the payload straight off the socket would be faster and wrong — a
 * socket that was disconnected cannot tell you what you missed while it was
 * away, and a cursor can.
 */
export function subscribeRealtime(userId: string, onHint: () => void): () => void {
  const client = getClient()
  if (!client) return () => {}

  let dispose = () => {}
  let cancelled = false

  void client.then((sb) => {
    if (cancelled) return
    const channel = sb
      .channel('records-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` },
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
