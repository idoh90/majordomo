import { VISUAL_FLOOR } from './strain'

export type HeatRamp = 'standard' | 'noir' | 'daylight'

/**
 * Heat scales. The cool→warm crossover stops are deliberately low-chroma so
 * the interpolation never passes through bright mud. `standard` is shared by
 * the dark skins; `noir` is the Noir Ledger duotone — soot paper warming
 * straight into vermilion; `daylight` is the light-skin ramp — recovered
 * muscles read as pale porcelain/pastel so they sit back on a pale
 * silhouette while the hot end stays the same ember/red.
 */
export const HEAT_STOPS: Record<HeatRamp, [number, string][]> = {
  standard: [
    [0.0, '#20242c'], // recovered graphite
    [1.5, '#1e3a4a'], // faint steel blue
    [3.0, '#2c6470'], // cool teal — lightly worked
    [4.5, '#6e6a2e'], // dark olive-gold handoff
    [6.0, '#c77e0a'], // amber
    [7.5, '#f0620c'], // orange
    [9.0, '#f53b1e'], // red-orange
    [10.0, '#ff2e1a'], // hot red
  ],
  noir: [
    [0.0, '#2a2320'], // rested paper-soot
    [2.5, '#4d2e22'], // warmed umber
    [5.0, '#8a3420'], // rust
    [7.5, '#c93c1f'], // vermilion
    [10.0, '#ff4a22'], // burning
  ],
  daylight: [
    [0.0, '#e3e2d8'], // recovered porcelain
    [1.5, '#b9cdd9'], // pale steel blue
    [3.0, '#7fb3bd'], // pastel teal — lightly worked
    [4.5, '#b0a94f'], // olive-gold handoff
    [6.0, '#e9a70d'], // amber
    [7.5, '#f0620c'], // orange
    [9.0, '#f53b1e'], // red-orange
    [10.0, '#ff2e1a'], // hot red
  ],
}

/** default ramp, kept for callers that don't care about skins */
export const COLOR_STOPS = HEAT_STOPS.standard

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export type Stops = [number, string][]

/** hex→rgb is done once per stops ARRAY, keyed by the array itself: the module
 *  constants are stable references, so this is a cache with no invalidation
 *  problem and no way to leak (an array nobody holds is collectable). */
const RGB_CACHE = new WeakMap<Stops, [number, [number, number, number]][]>()

function rgbStops(stops: Stops): [number, [number, number, number]][] {
  const cached = RGB_CACHE.get(stops)
  if (cached) return cached
  const made = stops.map(([v, hex]) => [v, hexToRgb(hex)] as [number, [number, number, number]])
  RGB_CACHE.set(stops, made)
  return made
}

/**
 * Sample any stop ramp at `v`, interpolating in RGB between the bracketing
 * stops and clamping to the ramp's own domain at both ends. Strain samples it
 * by strain 0–10; volume samples it by band position 0–3.5 — the axis is
 * whatever the caller's stops declare.
 */
export function rampColor(stops: Stops, v: number): string {
  const rgb = rgbStops(stops)
  const first = rgb[0]
  const last = rgb[rgb.length - 1]
  const s = Math.min(last[0], Math.max(first[0], v))
  let lo = first
  let hi = last
  for (let i = 0; i < rgb.length - 1; i++) {
    if (s >= rgb[i][0] && s <= rgb[i + 1][0]) {
      lo = rgb[i]
      hi = rgb[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0]
  const t = span === 0 ? 0 : (s - lo[0]) / span
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${mix(lo[1][0], hi[1][0])}, ${mix(lo[1][1], hi[1][1])}, ${mix(lo[1][2], hi[1][2])})`
}

export function strainToColor(strain: number, ramp: HeatRamp = 'standard'): string {
  if (strain < VISUAL_FLOOR) return HEAT_STOPS[ramp][0][1]
  return rampColor(HEAT_STOPS[ramp], strain)
}

/** Only hot muscles glow: 0 below strain 5, ramping to 0.85 at 10. */
export function glowOpacity(strain: number): number {
  if (strain < 5) return 0
  return Math.min(0.85, ((strain - 5) / 5) * 0.85)
}
