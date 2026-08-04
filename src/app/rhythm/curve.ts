/**
 * The day curve — a user-authored 24h energy curve, the estate's first
 * user-authored function of time-of-day. Pure math, no React, no stores.
 *
 * A curve is 2–8 control points (minutes since local midnight × energy 0–10)
 * and is PERIODIC: the segment from the last point back to the first (+24h)
 * closes the day, so energy(0:00) === energy(24:00) by construction and the
 * midnight join is smooth. No point is pinned to midnight.
 *
 * Interpolation is monotone cubic Hermite with Fritsch–Butland tangents
 * (the Fritsch–Carlson family): between two control points the curve never
 * leaves their value range, so it can never overshoot outside 0–10 — a
 * Catmull-Rom would, and clamping one kinks it.
 *
 * Lives in app/ on purpose: its only consumers are shell surfaces (the
 * Manor overlay, the settings sheet, the briefing). When a wing needs it
 * (the Watch placing recovery sleep at the trough), these files move to
 * core/rhythm/ — the storage key stays `majordomo-rhythm`, so that move is
 * imports only, no data migration.
 */

export interface CurvePoint {
  /** minutes since local midnight, integer 0…1439 (the Watch's startMin convention) */
  t: number
  /** energy 0…10 (the strain/slider scale) */
  v: number
}

export interface RhythmCurve {
  /** sorted by t, unique t, MIN_POINTS…MAX_POINTS entries */
  points: CurvePoint[]
}

export const MIN_POINTS = 2
export const MAX_POINTS = 8

/** editor snap grid — UX, not a data invariant; normalizeCurve does not force it */
export const SNAP_T = 15
export const SNAP_V = 0.5

/** below this value a booking is "against the curve" (the briefing's threshold) */
export const TROUGH = 3

export const DAY_MIN = 1440

/**
 * The shipped circadian shape: 04:00 trough, late-morning peak, post-lunch
 * dip, early-evening peak, descending through midnight. It is the editor's
 * gray reference and its starting draft — it is never auto-saved.
 */
export const DEFAULT_CURVE: RhythmCurve = {
  points: [
    { t: 60, v: 3 },
    { t: 240, v: 1.5 },
    { t: 420, v: 4 },
    { t: 600, v: 7.5 },
    { t: 810, v: 5.5 },
    { t: 1050, v: 8 },
    { t: 1290, v: 5 },
  ],
}

const isFiniteNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

/**
 * The guard between storage/wire and every renderer (the normalizeSkin rule:
 * runs on migrate AND rehydrate AND set AND sync-apply). Clamps, rounds,
 * sorts, dedupes and caps what it can; a blob too broken to keep two points
 * becomes null — dormant — rather than invented data.
 */
export function normalizeCurve(raw: unknown): RhythmCurve | null {
  if (typeof raw !== 'object' || raw === null) return null
  const pts = (raw as { points?: unknown }).points
  if (!Array.isArray(pts)) return null
  const cleaned: CurvePoint[] = []
  for (const p of pts) {
    if (typeof p !== 'object' || p === null) continue
    const { t, v } = p as { t?: unknown; v?: unknown }
    if (!isFiniteNum(t) || !isFiniteNum(v)) continue
    cleaned.push({
      t: Math.min(DAY_MIN - 1, Math.max(0, Math.round(t))),
      v: Math.min(10, Math.max(0, v)),
    })
  }
  cleaned.sort((a, b) => a.t - b.t)
  const unique: CurvePoint[] = []
  for (const p of cleaned) {
    if (unique.length && unique[unique.length - 1].t === p.t) continue // keep first — deterministic
    unique.push(p)
  }
  const points = unique.slice(0, MAX_POINTS)
  if (points.length < MIN_POINTS) return null
  return { points }
}

export function curvesEqual(a: RhythmCurve | null, b: RhythmCurve | null): boolean {
  if (a === null || b === null) return a === b
  if (a.points.length !== b.points.length) return false
  return a.points.every((p, i) => p.t === b.points[i].t && p.v === b.points[i].v)
}

/** precomputed periodic Hermite data: knots T (n+1, last = first + 1440), values V, tangents M */
interface Tangents {
  T: number[]
  V: number[]
  M: number[]
}

// tangents are pure in the curve object — memo on identity so evalCurve in a
// render loop (97 samples × 7 columns) costs a lookup, not a recompute
const tangentCache = new WeakMap<RhythmCurve, Tangents>()

function tangents(curve: RhythmCurve): Tangents {
  const hit = tangentCache.get(curve)
  if (hit) return hit
  const pts = curve.points
  const n = pts.length
  // knots with the wrap point appended; segment i spans [T[i], T[i+1])
  const T = pts.map((p) => p.t)
  T.push(pts[0].t + DAY_MIN)
  const V = pts.map((p) => p.v)
  V.push(pts[0].v)
  // per-segment widths and secants, periodic
  const H = Array.from({ length: n }, (_, i) => T[i + 1] - T[i])
  const D = Array.from({ length: n }, (_, i) => (V[i + 1] - V[i]) / H[i])
  // Fritsch–Butland tangent at each control point: 0 at a local extremum,
  // else the weighted harmonic mean of the neighboring secants — always
  // inside the monotone region, no second constraining pass needed
  const M = Array.from({ length: n }, (_, i) => {
    const dPrev = D[(i - 1 + n) % n]
    const dNext = D[i]
    if (dPrev * dNext <= 0) return 0
    const hPrev = H[(i - 1 + n) % n]
    const hNext = H[i]
    return (3 * (hPrev + hNext)) / ((2 * hNext + hPrev) / dPrev + (hNext + 2 * hPrev) / dNext)
  })
  M.push(M[0])
  const out = { T, V, M }
  tangentCache.set(curve, out)
  return out
}

/** energy at tMin (any minute value — evaluated periodically over the 24h day) */
export function evalCurve(curve: RhythmCurve, tMin: number): number {
  const { T, V, M } = tangents(curve)
  const n = curve.points.length
  const t0 = T[0]
  // normalize into [t0, t0 + 1440)
  const tt = t0 + ((((tMin - t0) % DAY_MIN) + DAY_MIN) % DAY_MIN)
  // segment lookup (n ≤ 8 — a linear scan beats bookkeeping)
  let i = n - 1
  for (let k = 0; k < n; k++) {
    if (tt < T[k + 1]) {
      i = k
      break
    }
  }
  const h = T[i + 1] - T[i]
  const s = (tt - T[i]) / h
  const s2 = s * s
  const s3 = s2 * s
  const value =
    (2 * s3 - 3 * s2 + 1) * V[i] +
    (s3 - 2 * s2 + s) * h * M[i] +
    (-2 * s3 + 3 * s2) * V[i + 1] +
    (s3 - s2) * h * M[i + 1]
  // monotone Hermite already stays within the endpoints; the clamp only
  // guards float dust at segment joins
  return Math.min(10, Math.max(0, value))
}

/** values at t = 0, step, …, 1440 inclusive (periodic: last === first) */
export function sampleCurve(curve: RhythmCurve, stepMin = 15): number[] {
  const out: number[] = []
  for (let t = 0; t <= DAY_MIN; t += stepMin) out.push(evalCurve(curve, t))
  return out
}
