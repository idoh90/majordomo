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

import { useSyncStore } from './sync/store'

/** every key the app owns. Order is cosmetic — the file is a plain map.
 *  Deliberately absent: `majordomo-telemetry` (core/telemetry) — an export
 *  must not carry one browser's analytics identity onto another device, and
 *  `parseEstate`'s unknown-key refusal keeps foreign files honest for free. */
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

/**
 * Fields that must never leave the device inside a file.
 *
 * The Ledger's Twelve Data key is a credential. It is a free, read-only quote
 * key — the cost of losing one is somebody burning a daily quota, not access to
 * anything — but an export is a file that gets mailed to yourself, dropped in a
 * cloud folder and pasted into a chat, and a file that quietly contains a
 * credential is a file nobody handles as one. The cloud sync already excludes it
 * for exactly this reason; the export is the other door out of the device and it
 * was standing open.
 *
 * The cost is one settings field to re-enter after restoring onto a new device,
 * which is also the moment a person is least surprised to be asked.
 */
const SECRETS: Record<string, readonly string[]> = {
  'majordomo-capital': ['apiKey'],
  'batman-capital': ['apiKey'],
}

/** blank the listed fields, leaving the blob otherwise byte-identical in shape */
function withoutSecrets(key: string, raw: string): string {
  const fields = SECRETS[key]
  if (!fields) return raw
  try {
    const blob = JSON.parse(raw) as { state?: Record<string, unknown> }
    if (typeof blob?.state !== 'object' || blob.state === null) return raw
    let touched = false
    for (const f of fields) {
      if (blob.state[f] !== undefined && blob.state[f] !== '') {
        blob.state[f] = ''
        touched = true
      }
    }
    return touched ? JSON.stringify(blob) : raw
  } catch {
    // Unparseable — carry it verbatim rather than dropping the wing. It cannot
    // be holding a readable key if it cannot be read.
    return raw
  }
}

export function buildEstateExport(): EstateFile {
  const blobs: Record<string, string> = {}
  for (const key of ALL_KEYS) {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) blobs[key] = withoutSecrets(key, v)
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

/* ------------------------------------------------------------- the blobs */

type FieldKind = 'array' | 'object' | 'number' | 'string'

const kindOf = (v: unknown): FieldKind | 'other' => {
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object' && v !== null) return 'object'
  if (typeof v === 'number' && Number.isFinite(v)) return 'number'
  if (typeof v === 'string') return 'string'
  return 'other'
}

/**
 * The load-bearing fields of each store, and what they must be.
 *
 * This exists because the old comment here — "each store validates its own
 * shape on rehydrate" — was simply not true, and the gap it left was a way to
 * brick the app from a file. Zustand only runs a store's `migrate` when the
 * persisted version DIFFERS from the current one, and an export writes the
 * current version by definition. So every defensive `?? []` in every migrate
 * chain is skipped for exactly the file this dialog accepts. A blob that is
 * valid JSON with `events` as a string, or `workouts` missing altogether, is
 * written to localStorage, and the next boot dies in a `.map` before anything
 * renders — with no screen left to explain it, because the app boots from
 * localStorage on purpose and has no loading gate to fail inside.
 *
 * Deliberately NOT a schema. It checks the top-level fields whose type the app
 * immediately assumes, and ignores everything else — including fields it has
 * never heard of, so a wing gaining one does not turn every older backup into a
 * refusal. The rule for adding a row: it belongs here if the app would throw
 * rather than misbehave.
 *
 * Missing counts as wrong, and that is not pedantry. Zustand's default merge is
 * a shallow spread of the persisted state over the initial state, so an absent
 * `events` does not fall back to `[]` — it overwrites the default with
 * `undefined`.
 *
 * The pre-pivot `batman-*` keys are absent on purpose: their version never
 * matches, so their migrate chains genuinely do run and genuinely do defend
 * themselves. They get the envelope check and nothing more.
 */
const REQUIRED: Record<string, Record<string, FieldKind>> = {
  'majordomo-shell': { skin: 'string', weekStart: 'number' },
  'majordomo-events': { events: 'array' },
  'majordomo-training': { workouts: 'array', weeklyGoal: 'number', profile: 'object' },
  'majordomo-study': {
    subjects: 'array',
    topics: 'array',
    homework: 'array',
    exams: 'array',
    sessions: 'object',
  },
  'majordomo-workshop': {
    ventures: 'array',
    cards: 'array',
    threads: 'array',
    milestones: 'array',
    sessions: 'object',
  },
  'majordomo-capital': {
    accounts: 'array',
    snapshots: 'array',
    holdings: 'array',
    monthlyBudget: 'number',
    spends: 'object',
    spendItems: 'array',
    recurring: 'array',
  },
  'majordomo-watch': { templates: 'array' },
}

/**
 * Read one store's blob far enough to know it will not detonate. Returns a
 * complaint in the user's words, or null when it is sound.
 *
 * Everything below the top level is still trusted, and that is a considered
 * limit rather than an oversight: walking every workout and every calendar
 * entry would put a copy of seven wings' type definitions in `core/`, which is
 * the one thing this layer is not allowed to know. What is caught here is the
 * class of damage that stops the app booting at all; a single malformed row
 * inside an otherwise sound array degrades one card, which the app survives and
 * the user can see and delete.
 */
function checkBlob(key: string, raw: string): string | null {
  const wing = STORE_LABEL[key] ?? key

  let blob: unknown
  try {
    blob = JSON.parse(raw)
  } catch {
    return `${wing} is not readable in that file.`
  }
  if (kindOf(blob) !== 'object') return `${wing} is not readable in that file.`

  const { state, version } = blob as { state?: unknown; version?: unknown }
  if (kindOf(state) !== 'object') return `${wing} is not readable in that file.`
  // Absent is tolerated — zustand treats a version-less blob as current, which
  // the field checks below already cover — but present and not a number means
  // the file was not written by this app.
  if (version !== undefined && typeof version !== 'number') {
    return `${wing} is not readable in that file.`
  }

  const required = REQUIRED[key]
  if (!required) return null

  const s = state as Record<string, unknown>
  for (const [field, kind] of Object.entries(required)) {
    if (kindOf(s[field]) !== kind) return `${wing} is damaged in that file.`
  }
  return null
}

/**
 * Never trust a pasted file. The envelope must be exactly what we wrote — our
 * tag, our keys, string values — and then each store inside it must be the
 * shape the app will assume the moment it boots. See `checkBlob` for why that
 * second half cannot be left to the stores themselves.
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
      return { ok: false, error: `${STORE_LABEL[key] ?? key} is damaged in that file.` }
    }
    const complaint = checkBlob(key, value)
    if (complaint) return { ok: false, error: complaint }
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
  // seen things this estate never did. Going COLD means the next sign-in
  // re-adopts insert-only — a union, in which nothing is overwritten and nothing
  // is deleted anywhere.
  //
  // `reset()` rather than removing the key, and the difference is the ownership
  // marker. Deleting the whole blob took `ownerId` with it, which turned an
  // import into a second route to the failure sign-out already had: hand somebody
  // your export file, let them open it while signed in, and the device that had
  // been refusing to send another account's records forgot it had ever belonged
  // to anyone. `reset()` clears the queue and the cursor and keeps the marker.
  try {
    useSyncStore.getState().reset()
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
