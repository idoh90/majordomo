/** Probe whether localStorage is writable (private mode / blocked cookies). */
export function storageAvailable(): boolean {
  try {
    const k = '__batman_probe__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
}
