import type { Dial } from './dials'

/**
 * The instrument's plot geometry — one function, five chart shapes.
 *
 * The viewBox is fixed at 300 × 110 and drawn with `preserveAspectRatio="none"`,
 * so the card can be any width and the paths never need recomputing. That has
 * one consequence worth remembering: anything CIRCULAR must be an HTML element
 * positioned in percent, never an SVG `<circle>` — the non-uniform scale would
 * squash it into an ellipse. The Ledger's trend chart learned this first.
 */

export const W = 300
export const H = 110
const PT = 10
const PB = 8
const PL = 6
const PR = 6
const PW = W - PL - PR
const PH = H - PT - PB

export interface Bar {
  x: number
  y: number
  w: number
  h: number
  /** the bar under the reader's finger, or the newest one when idle */
  active: boolean
  /** a diverging bar below the zero line */
  negative: boolean
}

export interface Plot {
  /** filled area under a line */
  areaD: string
  /** the line itself, up to `nowIdx` */
  lineD: string
  /** the forecast tail, past `nowIdx` */
  dashD: string
  /** the vertical "now" mark where a line becomes a forecast */
  nowD: string
  /** the even-pace guide */
  guideD: string
  /** the horizontal reference line, and where to hang its label */
  ruleD: string
  ruleTop: string
  bars: Bar[]
  /** where a scrub marker sits, in percent of the plot box */
  scrubLeft: string
  scrubTop: string
  /** …and where its chip sits, clamped so it cannot leave the card */
  chipLeft: string
}

const isLineKind = (k: Dial['kind']) => k === 'line' || k === 'pace'

function xOf(d: Dial, i: number): number {
  const n = d.points.length
  const f = d.fx ? d.fx[i] : n === 1 ? 0 : i / (n - 1)
  return PL + f * PW
}

function yOf(d: Dial, v: number): number {
  const span = d.max - d.min || 1
  return PT + (1 - (v - d.min) / span) * PH
}

/** the point index nearest the pointer, given a 0–1 position across the card */
export function indexAt(d: Dial, f: number): number {
  const n = d.points.length
  if (n === 0) return 0
  const px = (f * W - PL) / PW
  if (isLineKind(d.kind)) {
    let best = Infinity
    let idx = 0
    for (let i = 0; i < n; i++) {
      const fx = d.fx ? d.fx[i] : n === 1 ? 0 : i / (n - 1)
      const dist = Math.abs(fx - px)
      if (dist < best) {
        best = dist
        idx = i
      }
    }
    return idx
  }
  return Math.max(0, Math.min(n - 1, Math.floor(px * n)))
}

export function plot(d: Dial, scrubIdx: number | null): Plot {
  const n = d.points.length
  const p: Plot = {
    areaD: '',
    lineD: '',
    dashD: '',
    nowD: '',
    guideD: '',
    ruleD: '',
    ruleTop: '0%',
    bars: [],
    scrubLeft: '',
    scrubTop: '',
    chipLeft: '',
  }
  if (n === 0) return p

  if (d.rule) {
    const y = yOf(d, d.rule.v)
    p.ruleD = `M${PL} ${y.toFixed(1)} L${W - PR} ${y.toFixed(1)}`
    p.ruleTop = `${((y / H) * 100).toFixed(1)}%`
  }
  if (d.guide) {
    const [[gx0, gv0], [gx1, gv1]] = d.guide
    p.guideD = `M${(PL + gx0 * PW).toFixed(1)} ${yOf(d, gv0).toFixed(1)} L${(PL + gx1 * PW).toFixed(1)} ${yOf(d, gv1).toFixed(1)}`
  }

  if (isLineKind(d.kind)) {
    const at = (i: number) => `${xOf(d, i).toFixed(1)} ${yOf(d, d.points[i].v).toFixed(1)}`
    const upto = d.nowIdx != null ? Math.min(d.nowIdx, n - 1) : n - 1
    let line = `M${at(0)}`
    for (let i = 1; i <= upto; i++) line += ` L${at(i)}`
    p.lineD = line
    if (d.nowIdx != null && d.nowIdx < n - 1) {
      let tail = `M${at(upto)}`
      for (let i = upto + 1; i < n; i++) tail += ` L${at(i)}`
      p.dashD = tail
      const nx = xOf(d, upto).toFixed(1)
      p.nowD = `M${nx} ${PT} L${nx} ${H - 2}`
    }
    let area = `M${xOf(d, 0).toFixed(1)} ${H}`
    for (let i = 0; i < n; i++) area += ` L${at(i)}`
    area += ` L${xOf(d, n - 1).toFixed(1)} ${H} Z`
    p.areaD = area
  } else {
    const slot = PW / n
    const bw = Math.min(14, slot * 0.55)
    const mid = d.kind === 'diverge' ? yOf(d, 0) : 0
    for (let i = 0; i < n; i++) {
      const v = d.points[i].v
      const x = PL + slot * i + (slot - bw) / 2
      const active = scrubIdx === null ? i === n - 1 : scrubIdx === i
      if (d.kind === 'band') {
        // a stretch between two values on the same axis. A point with no `lo`
        // is a night with nothing on file: it draws NOTHING rather than a bar
        // sitting on the floor, because a floor reading is a claim about a
        // night that was never written down.
        const lo = d.points[i].lo
        if (lo === undefined) {
          p.bars.push({ x, y: PT, w: bw, h: 0, active, negative: false })
          continue
        }
        const top = yOf(d, Math.max(v, lo))
        const bottom = yOf(d, Math.min(v, lo))
        p.bars.push({ x, y: top, w: bw, h: Math.max(2, bottom - top), active, negative: false })
      } else if (d.kind === 'diverge') {
        const h = Math.max(2, (Math.abs(v) / (d.max || 1)) * (PH / 2))
        p.bars.push({ x, y: v >= 0 ? mid - h : mid, w: bw, h, active, negative: v < 0 })
      } else {
        const h = Math.max(2, ((v - d.min) / (d.max - d.min || 1)) * PH)
        p.bars.push({ x, y: PT + PH - h, w: bw, h, active, negative: false })
      }
    }
    if (d.kind === 'diverge') {
      p.ruleD = `M${PL} ${mid.toFixed(1)} L${W - PR} ${mid.toFixed(1)}`
    }
  }

  if (scrubIdx !== null && scrubIdx >= 0 && scrubIdx < n) {
    const v = d.points[scrubIdx].v
    let leftF: number
    let topY: number
    if (isLineKind(d.kind)) {
      leftF = xOf(d, scrubIdx) / W
      topY = yOf(d, v)
    } else {
      const slot = PW / n
      leftF = (PL + slot * scrubIdx + slot / 2) / W
      const bar = p.bars[scrubIdx]
      topY =
        d.kind === 'band'
          ? bar.h === 0
            ? PT + PH
            : bar.y + bar.h / 2
          : bar.negative
            ? bar.y + bar.h
            : bar.y
    }
    p.scrubLeft = `${(leftF * 100).toFixed(2)}%`
    p.scrubTop = `${((topY / H) * 100).toFixed(2)}%`
    p.chipLeft = `${Math.max(18, Math.min(82, leftF * 100)).toFixed(2)}%`
  }

  return p
}
