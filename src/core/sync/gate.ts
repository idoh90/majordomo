import { storageAvailable } from '../storage'

/**
 * The registry's gate — whether sync may run at all, and if not, why.
 *
 * Every answer here is settled ONCE at module load and never changes for the
 * life of the tab: the env vars are replaced statically at build time, `?demo`
 * is fixed at navigation, and a browser refusing storage at boot will refuse it
 * later too. Callers may treat `armed()` as a constant.
 */

const read = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export const SUPABASE_URL = read(import.meta.env.VITE_SUPABASE_URL)

/**
 * PUBLIC by design — this ships in the browser bundle, and row-level security
 * is the only thing guarding the data. Never put the service_role key here.
 */
export const SUPABASE_ANON_KEY = read(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const CONFIGURED = SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== ''

/**
 * The demo interlock.
 *
 * `?demo` seeds fixtures into empty stores at import time, and localhost is a
 * different ORIGIN with its own empty storage — but a cloud account is
 * origin-independent. Without this, the screenshot ritual in CLAUDE.md would
 * push eight invented bank accounts and a brutal week into the real estate, and
 * every device would pull them forever: the cold path is insert-only, so
 * fixtures would never be cleaned up again.
 */
export const DEMO =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo')

/**
 * Supabase keeps its session in localStorage, and the sync queue has to be
 * durable to survive a reload. With storage refused, every boot would look like
 * a brand-new device — so the door stays shut rather than half-working.
 */
const STORAGE_OK = storageAvailable()

export type OffReason = 'unconfigured' | 'demo' | 'storage'

/** why the registry is shut, or null when it is open */
export function offReason(): OffReason | null {
  if (!CONFIGURED) return 'unconfigured'
  if (DEMO) return 'demo'
  if (!STORAGE_OK) return 'storage'
  return null
}

export function armed(): boolean {
  return offReason() === null
}
