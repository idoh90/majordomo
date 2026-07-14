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

const RGB_RAMPS = Object.fromEntries(
  (Object.keys(HEAT_STOPS) as HeatRamp[]).map((ramp) => [
    ramp,
    HEAT_STOPS[ramp].map(([v, hex]) => [v, hexToRgb(hex)] as [number, [number, number, number]]),
  ]),
) as Record<HeatRamp, [number, [number, number, number]][]>

export function strainToColor(strain: number, ramp: HeatRamp = 'standard'): string {
  const stops = RGB_RAMPS[ramp]
  if (strain < VISUAL_FLOOR) return HEAT_STOPS[ramp][0][1]
  const s = Math.min(10, Math.max(0, strain))
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (s >= stops[i][0] && s <= stops[i + 1][0]) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const span = hi[0] - lo[0]
  const t = span === 0 ? 0 : (s - lo[0]) / span
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t)
  return `rgb(${mix(lo[1][0], hi[1][0])}, ${mix(lo[1][1], hi[1][1])}, ${mix(lo[1][2], hi[1][2])})`
}

/** Only hot muscles glow: 0 below strain 5, ramping to 0.85 at 10. */
export function glowOpacity(strain: number): number {
  if (strain < 5) return 0
  return Math.min(0.85, ((strain - 5) / 5) * 0.85)
}
