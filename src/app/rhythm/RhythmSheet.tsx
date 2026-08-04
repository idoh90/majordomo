import { useEffect, useMemo, useRef, useState } from 'react'
import { Sheet } from '../../core/ui/Sheet'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { voice } from '../../core/voice'
import {
  DAY_MIN,
  DEFAULT_CURVE,
  MAX_POINTS,
  MIN_POINTS,
  SNAP_T,
  SNAP_V,
  curvesEqual,
  sampleCurve,
  type CurvePoint,
} from './curve'
import { useRhythmStore } from './store'

/**
 * The day-curve editor: a tone-curve-style graph whose control points are
 * dragged into the shape of the user's day. The gray reference is the
 * shipped default; the accent curve is the draft. Handles are HTML buttons
 * positioned in percent over the SVG — under preserveAspectRatio="none" an
 * SVG circle squashes to an ellipse (the NetWorthChart rule), and HTML
 * handles get real focus/keyboard semantics for free.
 *
 * The app's one slider keeps a native <input type=range> under custom
 * pixels for free a11y; that trick is 1D and cannot carry a 2D handle, so
 * this is the first surface with hand-wired arrow-key editing (←→ time,
 * ↑↓ energy, Shift for coarse, Delete removes).
 */

const W = 600
const H = 220
/** graph rendering resolution — 7.5 min ≈ 3 viewBox units per step */
const STEP = 7.5

const hhmm = (t: number) =>
  `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
const fmtV = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

const toPath = (samples: number[]) =>
  samples
    .map(
      (v, k) =>
        `${k ? 'L' : 'M'}${(((k * STEP) / DAY_MIN) * W).toFixed(1)} ${((1 - v / 10) * H).toFixed(1)}`,
    )
    .join(' ')

interface RhythmSheetProps {
  open: boolean
  onClose: () => void
}

export function RhythmSheet({ open, onClose }: RhythmSheetProps) {
  const stored = useRhythmStore((s) => s.curve)
  const [draft, setDraft] = useState<CurvePoint[]>(() =>
    (useRhythmStore.getState().curve ?? DEFAULT_CURVE).points.map((p) => ({ ...p })),
  )
  const [selected, setSelected] = useState<number | null>(null)
  const [capNote, setCapNote] = useState(false)
  const [confirmRetire, setConfirmRetire] = useState(false)

  const graphRef = useRef<HTMLDivElement>(null)
  // a drag's release fires a click at the down/up common ancestor — swallow it
  // so the drop doesn't also add a point (the WeekGrid suppression window)
  const suppressClickUntil = useRef(0)

  // seeded on open ALONE: re-seeding on store writes (a sync landing) would
  // wipe the half-drawn curve under the user's pointer — the SpendSheet rule
  useEffect(() => {
    if (!open) return
    const cur = useRhythmStore.getState().curve
    setDraft((cur ?? DEFAULT_CURVE).points.map((p) => ({ ...p })))
    setSelected(null)
    setCapNote(false)
  }, [open])

  // while the retire confirm is up it owns Esc (the Sheet contract) — capture
  // so the Sheet's own listener can't also raise the discard confirm under it
  useEffect(() => {
    if (!confirmRetire) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      e.stopPropagation()
      setConfirmRetire(false)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, true)
  }, [confirmRetire])

  // dirty = differs from the store (or, dormant, from the untouched default):
  // an unedited sheet closes silently and saves nothing — the feature never
  // imposes. Save is the one deliberate way the default becomes a saved curve.
  const dirty = useMemo(
    () => !curvesEqual({ points: draft }, stored ?? DEFAULT_CURVE),
    [draft, stored],
  )

  const geom = useMemo(() => {
    const line = toPath(sampleCurve({ points: draft }, STEP))
    return { line, area: `${line} L${W} ${H} L0 ${H} Z` }
  }, [draft])
  const refLine = useMemo(() => toPath(sampleCurve(DEFAULT_CURVE, STEP)), [])

  const select = (i: number | null) => {
    setSelected(i)
    setCapNote(false)
  }

  const clampT = (points: CurvePoint[], i: number, t: number) => {
    const lo = i > 0 ? points[i - 1].t + SNAP_T : 0
    const hi = i < points.length - 1 ? points[i + 1].t - SNAP_T : DAY_MIN - SNAP_T
    return Math.max(lo, Math.min(hi, t))
  }

  const movePoint = (i: number, t: number, v: number) =>
    setDraft((d) =>
      d.map((p, k) =>
        k === i
          ? {
              t: clampT(d, i, Math.round(t / SNAP_T) * SNAP_T),
              v: Math.max(0, Math.min(10, Math.round(v / SNAP_V) * SNAP_V)),
            }
          : p,
      ),
    )

  const removePoint = (i: number) => {
    if (draft.length <= MIN_POINTS) return
    setDraft((d) => d.filter((_, k) => k !== i))
    select(null)
  }

  /* --------------------------------------------------------------- pointer */

  const onHandleDown = (i: number, ev: React.PointerEvent<HTMLButtonElement>) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse') return
    const wrap = graphRef.current
    if (!wrap) return
    ev.preventDefault() // no text selection; focus is granted by hand below
    ev.currentTarget.focus()
    select(i)
    const rect = wrap.getBoundingClientRect()
    const orig = { ...draft[i] }
    const startX = ev.clientX
    const startY = ev.clientY
    let moved = false

    // pointermove outruns the display — coalesce to one commit per frame,
    // mirror the last snapped slot in a local so identical frames bail out
    // (the WeekGrid drag engine, minus columns)
    let raf = 0
    let pendingX = 0
    let pendingY = 0
    let last = { t: orig.t, v: orig.v }

    const apply = () => {
      raf = 0
      const rawT = ((pendingX - rect.left) / rect.width) * DAY_MIN
      const rawV = (1 - (pendingY - rect.top) / rect.height) * 10
      const t = clampT(draft, i, Math.round(rawT / SNAP_T) * SNAP_T)
      const v = Math.max(0, Math.min(10, Math.round(rawV / SNAP_V) * SNAP_V))
      if (t === last.t && v === last.v) return // snapped to the same slot
      last = { t, v }
      navigator.vibrate?.(5)
      setDraft((d) => d.map((p, k) => (k === i ? { t, v } : p)))
    }
    const mm = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - startX, m.clientY - startY) < 5) return
      moved = true
      pendingX = m.clientX
      pendingY = m.clientY
      if (!raf) raf = requestAnimationFrame(apply)
      m.preventDefault()
    }
    const stop = (commit: boolean) => {
      window.removeEventListener('pointermove', mm)
      window.removeEventListener('pointerup', mu)
      window.removeEventListener('pointercancel', pc)
      window.removeEventListener('keydown', onKey, true)
      if (raf) {
        cancelAnimationFrame(raf)
        if (commit) apply() // flush so the drop lands where the pointer is
      }
      if (!moved) return
      suppressClickUntil.current = Date.now() + 250
      if (!commit) setDraft((d) => d.map((p, k) => (k === i ? orig : p)))
    }
    const mu = () => stop(true)
    const pc = () => stop(false)
    // Escape mid-drag restores the point and must NOT reach the Sheet's own
    // window listener (which would pop the discard confirm): capture phase
    // runs first, and stopping propagation there starves the bubble listener.
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== 'Escape') return
      k.stopImmediatePropagation()
      k.stopPropagation()
      stop(false)
    }
    window.addEventListener('pointermove', mm)
    window.addEventListener('pointerup', mu)
    window.addEventListener('pointercancel', pc)
    window.addEventListener('keydown', onKey, { capture: true })
  }

  /* -------------------------------------------------------------- keyboard */

  const onHandleKey = (i: number, ev: React.KeyboardEvent) => {
    if (ev.key === 'Delete' || ev.key === 'Backspace') {
      ev.preventDefault()
      removePoint(i)
      return
    }
    const step = ev.shiftKey ? 4 : 1
    const p = draft[i]
    if (ev.key === 'ArrowLeft') movePoint(i, p.t - SNAP_T * step, p.v)
    else if (ev.key === 'ArrowRight') movePoint(i, p.t + SNAP_T * step, p.v)
    else if (ev.key === 'ArrowUp') movePoint(i, p.t, p.v + SNAP_V * step)
    else if (ev.key === 'ArrowDown') movePoint(i, p.t, p.v - SNAP_V * step)
    else return
    ev.preventDefault()
  }

  /* -------------------------------------------------------- add on the graph */

  const onGraphClick = (ev: React.MouseEvent) => {
    if (Date.now() < suppressClickUntil.current) return
    if ((ev.target as HTMLElement).closest('[data-handle]')) return
    const wrap = graphRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const t = Math.max(
      0,
      Math.min(
        DAY_MIN - SNAP_T,
        Math.round((((ev.clientX - rect.left) / rect.width) * DAY_MIN) / SNAP_T) * SNAP_T,
      ),
    )
    // a tap beside an existing point selects it rather than crowding it
    const near = draft.findIndex((p) => Math.abs(p.t - t) < SNAP_T)
    if (near >= 0) return select(near)
    if (draft.length >= MAX_POINTS) return setCapNote(true)
    const v = Math.max(
      0,
      Math.min(
        10,
        Math.round(((1 - (ev.clientY - rect.top) / rect.height) * 10) / SNAP_V) * SNAP_V,
      ),
    )
    const points = [...draft, { t, v }].sort((a, b) => a.t - b.t)
    setDraft(points)
    select(points.findIndex((p) => p.t === t))
  }

  /* ----------------------------------------------------------------- commit */

  const save = () => {
    useRhythmStore.getState().setCurve({ points: draft })
    onClose() // straight out — Save never meets the discard guard
  }

  const sel = selected !== null ? draft[selected] : null

  return (
    <Sheet open={open} onClose={onClose} dirty={dirty}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">{voice.rhythm.title}</h2>
      <p className="mb-3 text-sm text-ink-dim">{voice.rhythm.blurb}</p>

      {/* fixed-height readout: the active point's coordinates, or the hint —
          reserved so the graph never jumps when a selection appears */}
      <div aria-live="polite" className="mb-1 flex h-6 items-center justify-center">
        {/* a refused add outranks a stale selection — the tap deserves its answer;
            any select/drag clears the note again */}
        {capNote ? (
          <span className="text-xs text-ink-faint">{voice.rhythm.hintFull}</span>
        ) : sel ? (
          <span className="font-display text-sm font-semibold tabular-nums text-accent">
            {voice.rhythm.readout({ time: hhmm(sel.t), value: fmtV(sel.v) })}
          </span>
        ) : (
          <span className="text-xs text-ink-faint">{voice.rhythm.hintAdd}</span>
        )}
      </div>

      {/* coordinate + interaction layer: NO overflow clipping here, so edge
          handles overhang into the sheet's padding (the endpoint-marker rule) */}
      <div ref={graphRef} className="relative" onClick={onGraphClick}>
        <div className="overflow-hidden rounded-xl border border-trough-line bg-trough">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block h-[220px] w-full text-accent"
            aria-hidden
          >
            <defs>
              <linearGradient id="rhythm-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[6, 12, 18].map((h) => (
              <line
                key={h}
                x1={(h / 24) * W}
                y1={0}
                x2={(h / 24) * W}
                y2={H}
                stroke="var(--color-line)"
                strokeOpacity={0.7}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {[2.5, 5, 7.5].map((v) => (
              <line
                key={v}
                x1={0}
                y1={(1 - v / 10) * H}
                x2={W}
                y2={(1 - v / 10) * H}
                stroke="var(--color-line)"
                strokeOpacity={0.4}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {/* the shipped default, kept in gray for bearings */}
            <path
              d={refLine}
              fill="none"
              stroke="var(--color-ink-faint)"
              strokeOpacity={0.5}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <path d={geom.area} fill="url(#rhythm-fill)" />
            <path
              d={geom.line}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>

        <span className="pointer-events-none absolute left-1.5 top-1 text-[10px] tabular-nums text-ink-faint">
          10
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1.5 text-[10px] tabular-nums text-ink-faint">
          0
        </span>

        {draft.map((p, i) => (
          <button
            key={i}
            type="button"
            data-handle
            aria-label={voice.rhythm.pointLabel({ time: hhmm(p.t), value: fmtV(p.v) })}
            onPointerDown={(ev) => onHandleDown(i, ev)}
            onKeyDown={(ev) => onHandleKey(i, ev)}
            onClick={(ev) => ev.stopPropagation()}
            onFocus={() => select(i)}
            className="absolute z-[2] flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center outline-none focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2 focus-visible:outline-accent"
            style={{
              left: `${(p.t / DAY_MIN) * 100}%`,
              top: `${(1 - p.v / 10) * 100}%`,
              touchAction: 'none',
            }}
          >
            <span
              className={`pointer-events-none block h-3.5 w-3.5 rounded-full border-2 border-accent transition-transform ${
                selected === i ? 'scale-110 bg-accent' : 'bg-trough'
              }`}
            />
          </button>
        ))}
      </div>

      {/* hour rail — absolute so the marks sit exactly under the 6h grid */}
      <div className="relative mt-1.5 h-4 text-[10px] tabular-nums text-ink-faint">
        {[0, 6, 12, 18, 24].map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => selected !== null && removePoint(selected)}
          disabled={selected === null || draft.length <= MIN_POINTS}
          className="btn-soft px-4 py-3 text-sm disabled:opacity-40"
        >
          {voice.rhythm.removePoint}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(DEFAULT_CURVE.points.map((p) => ({ ...p })))
            select(null)
          }}
          className="btn-soft px-4 py-3 text-sm"
        >
          {voice.rhythm.reset}
        </button>
        <button type="button" onClick={save} className="btn-cta flex-1 py-3 text-base">
          {voice.rhythm.save}
        </button>
      </div>

      {stored !== null && (
        <button
          type="button"
          onClick={() => setConfirmRetire(true)}
          className="mx-auto mt-3 block text-xs text-danger/80 transition-colors hover:text-danger"
        >
          {voice.rhythm.retire}
        </button>
      )}

      <ConfirmDialog
        open={confirmRetire}
        title={voice.rhythm.retireTitle}
        message={voice.rhythm.retireBody}
        confirmLabel={voice.rhythm.retireYes}
        onCancel={() => setConfirmRetire(false)}
        onConfirm={() => {
          setConfirmRetire(false)
          useRhythmStore.getState().clearCurve()
          onClose()
        }}
      />
    </Sheet>
  )
}
