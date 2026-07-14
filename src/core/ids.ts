/** Collision-resistant id; falls back off crypto.randomUUID for non-secure
 *  contexts (e.g. LAN http from a phone) that don't expose it. */
export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
