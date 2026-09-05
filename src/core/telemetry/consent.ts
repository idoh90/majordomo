import { TERMS_VERSION, useShellStore } from '../store/shell'

/**
 * THE consent predicate — one implementation, every reader.
 *
 * Two things read it: the usage counts (`core/telemetry/index.ts`) and the
 * Meta Pixel (`core/ads/meta.ts`). Different systems, different vendors, and
 * the Privacy Policy makes ONE promise for both — agreed at the door,
 * withdrawn by one switch, suppressed by Global Privacy Control — so the
 * promise lives in one function. A second copy would be a second place for
 * the two to disagree, and the door's own line says "one switch that stops
 * both".
 *
 * It lives apart from core/telemetry/index.ts on purpose: that file imports
 * the auth store, and through it the Supabase client, and the landing page —
 * which asks this question on the pixel's behalf — must not pay for either.
 * This file reaches the shell store and nothing heavier.
 *
 * Reading the shell store WRITES NOTHING. zustand's persist touches storage
 * on a migration or a set, and a fresh browser has neither — load-bearing on
 * the landing, where `hasEstate()` treats any majordomo* key as a resident.
 * scripts/pixel-harness.mjs asserts it against a real browser.
 */

/** the browser is raising Global Privacy Control — a standing "no" that
 *  outranks anything stored on this device, an acceptance included */
export function gpcRaised(): boolean {
  return (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

/** the door has not been answered at the current terms version on this
 *  device — neither agreed nor declined */
export function doorPending(): boolean {
  return useShellStore.getState().termsAccepted < TERMS_VERSION
}

/** consent stands: the current terms agreed at the door, the settings switch
 *  not off, and no Global Privacy Control. Everything that leaves the device
 *  for a third party asks this first, and asks nothing else. */
export function consentGranted(): boolean {
  if (doorPending()) return false
  if (useShellStore.getState().telemetryOff) return false
  if (gpcRaised()) return false
  return true
}
