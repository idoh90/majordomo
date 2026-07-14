/** Probe whether localStorage is writable (private mode / blocked cookies). */
export function storageAvailable(): boolean {
  try {
    const k = '__storage_probe__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}

/**
 * Pre-pivot blobs were keyed `batman-*`. On first boot after the rename, copy
 * the old blob to the new key VERBATIM — it carries its own persisted
 * `version`, so each store's own zustand migrate chain then runs exactly as if
 * the key had always been the new one. The old key is deliberately left in
 * place as insurance; nothing reads it once the new key exists.
 */
export function adoptLegacyKey(newKey: string, legacyKey: string): void {
  try {
    if (localStorage.getItem(newKey) !== null) return
    const old = localStorage.getItem(legacyKey)
    if (old !== null) localStorage.setItem(newKey, old)
  } catch {
    // blocked storage — the store falls back to its defaults
  }
}
