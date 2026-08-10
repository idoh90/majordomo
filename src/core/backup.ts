/**
 * The estate backup — every store in one file.
 *
 * The wings each own a localStorage blob and each blob carries its own
 * persisted `version`, so the honest way to move an estate between machines
 * (or between origins — localhost and the deployed app are different origins
 * and share nothing) is to carry the blobs VERBATIM and let each store's own
 * zustand migrate chain run on rehydrate. Same philosophy as adoptLegacyKey:
 * copy the bytes, let the stores interpret them.
 *
 * This is the backup ritual the build plan asks for before any storage
 * migration, and the only bridge onto a phone.
 */

/** every key the app owns. Order is cosmetic — the file is a plain map. */
export const ESTATE_KEYS = [
  'majordomo-shell',
  'majordomo-events',
  'majordomo-training',
  'majordomo-study',
  'majordomo-workshop',
  'majordomo-capital',
  'majordomo-watch',
] as const

/** pre-pivot keys: still adopted on first boot, so a backup carries them too */
const LEGACY_KEYS = ['batman-shell', 'batman-workouts', 'batman-capital'] as const

const ALL_KEYS: readonly string[] = [...ESTATE_KEYS, ...LEGACY_KEYS]

export const ESTATE_TAG = 'majordomo-estate'

export interface EstateFile {
  app: typeof ESTATE_TAG
  version: 1
  exportedAt: string
  /** key → the raw localStorage string, exactly as the store wrote it */
  blobs: Record<string, string>
}

export function buildEstateExport(): EstateFile {
  const blobs: Record<string, string> = {}
  for (const key of ALL_KEYS) {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) blobs[key] = v
    } catch {
      // blocked storage — export what we can
    }
  }
  return {
    app: ESTATE_TAG,
    version: 1,
    exportedAt: new Date().toISOString(),
    blobs,
  }
}

export function serializeEstate(): string {
  return JSON.stringify(buildEstateExport(), null, 2)
}

/** what an import would touch, for the confirm dialog's benefit */
export interface EstatePreview {
  keys: string[]
  exportedAt: string
}

export type EstateParse = { ok: true; file: EstateFile; preview: EstatePreview } | { ok: false; error: string }

/**
 * Never trust a pasted file. The blobs themselves are opaque (each store
 * validates its own shape on rehydrate), but the envelope must be exactly
 * what we wrote: our tag, our keys, string values.
 */
export function parseEstate(json: string): EstateParse {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return { ok: false, error: 'That is not valid JSON.' }
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'Unexpected file format.' }
  }
  const d = data as Record<string, unknown>
  if (d.app !== ESTATE_TAG) {
    return { ok: false, error: 'Not a Majordomo estate backup.' }
  }
  if (typeof d.blobs !== 'object' || d.blobs === null) {
    return { ok: false, error: 'The file carries no stores.' }
  }
  const raw = d.blobs as Record<string, unknown>
  const blobs: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    // an unknown key is a foreign file, not a newer one — refuse rather than
    // write arbitrary keys into the user's storage
    if (!ALL_KEYS.includes(key)) {
      return { ok: false, error: `Unexpected store "${key}" in the file.` }
    }
    if (typeof value !== 'string') {
      return { ok: false, error: `The "${key}" store is malformed.` }
    }
    blobs[key] = value
  }
  const keys = Object.keys(blobs)
  if (keys.length === 0) {
    return { ok: false, error: 'The file carries no stores.' }
  }
  const exportedAt = typeof d.exportedAt === 'string' ? d.exportedAt : ''
  return {
    ok: true,
    file: { app: ESTATE_TAG, version: 1, exportedAt, blobs },
    preview: { keys, exportedAt },
  }
}

/**
 * Replace the estate with the file's. Every key the file carries is
 * overwritten; keys it doesn't carry are left alone. The caller reloads —
 * the stores rehydrated at import time, so nothing short of a reload can be
 * trusted to reflect the new blobs.
 */
export function applyEstate(file: EstateFile): void {
  for (const [key, value] of Object.entries(file.blobs)) {
    localStorage.setItem(key, value)
  }
  // The registry's bookkeeping now describes an estate that is gone: its queue
  // points at records this device no longer has, and its cursor claims to have
  // seen things this estate never did. Dropping it makes the device COLD, so
  // the next sign-in re-adopts insert-only — a union, in which nothing is
  // overwritten and nothing is deleted anywhere.
  try {
    localStorage.removeItem('majordomo-sync')
  } catch {
    // blocked storage — the registry is off anyway
  }
}

/** human-readable store names for the import confirm */
export const STORE_LABEL: Record<string, string> = {
  'majordomo-shell': 'Settings',
  'majordomo-events': 'The Manor',
  'majordomo-training': 'The Grounds',
  'majordomo-study': 'The Study',
  'majordomo-workshop': 'The Workshop',
  'majordomo-capital': 'The Ledger',
  'majordomo-watch': 'The Watch',
  'batman-shell': 'Settings (legacy)',
  'batman-workouts': 'The Grounds (legacy)',
  'batman-capital': 'The Ledger (legacy)',
}
