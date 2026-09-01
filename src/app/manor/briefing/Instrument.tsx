import { useState, type PointerEvent } from 'react'
import { voice } from '../../../core/voice'
import { useShellStore } from '../../../core/store/shell'
import { SKINS } from '../../../core/ui/skins'
import { BodySvg } from '../../../modules/training/components/bodymap/BodySvg'
import { muscleLabel } from '../../../modules/training/data/muscles'
import { glowOpacity, strainToColor } from '../../../modules/training/lib/strainColor'
import type { MuscleId } from '../../../modules/training/types'
import type { Dial } from './dials'
import { H, indexAt, plot, W } from './geometry'

/** a wing colour, thinned */
const tint = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`

/**
 * One dial on the board.
 *
 * Two readable surfaces, one card: a chart you can drag across to read point
 * by point, or the body map with its own hover read-out. Both put the same
 * chip in the same corner, so the gesture is learned once.
 */
export function Instrument({
  dial,
  pendingLabel,
  onPlace,
}: {
  dial: Dial
  /** a shelf chip is picked up and waiting for a slot */
  pendingLabel: string | null
  onPlace: () => void
}) {
  const [scrub, setScrub] = useState<number | null>(null)
  const [muscle, setMuscle] = useState<MuscleId | null>(null)
  const V = voice.briefing.brief

  const p = plot(dial, scrub)
  const first = dial.points[0]?.label ?? ''
  const last = dial.points[dial.points.length - 1]?.label ?? ''

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const i = indexAt(dial, f)
    if (i !== scrub) setScrub(i)
  }

  return (
    <div className="trough relative min-w-0 px-3.5 pb-2.5 pt-3 transition-colors duration-150 hover:border-ink/15">
      {pendingLabel && (
        <button
          type="button"
          onClick={onPlace}
          className="absolute inset-0 z-[5] flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed"
          style={{
            borderColor: 'var(--color-accent)',
            background: 'color-mix(in srgb, var(--color-bg) 66%, transparent)',
          }}
        >
          <span className="whitespace-nowrap font-display text-[11px] font-semibold tracking-[0.2em] text-accent">
            {V.shelf.place(pendingLabel)}
          </span>
          <span className="text-[9.5px] text-ink-dim">{V.shelf.replaces(dial.name)}</span>
        </button>
      )}

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-[7px] gap-y-1">
            <span
              aria-hidden
              className="h-1.5 w-1.5 flex-none rounded-full"
              style={{ background: dial.color, boxShadow: `0 0 8px ${tint(dial.color, 55)}` }}
            />
            <span
              className="whitespace-nowrap font-display text-[10.5px] font-semibold tracking-[0.2em]"
              style={{ color: dial.color }}
            >
              {dial.name}
            </span>
            <span className="whitespace-nowrap font-display text-[9px] font-semibold tracking-[0.18em] text-ink-faint">
              {dial.wing}
            </span>
          </div>
        </div>
        <div className="flex-none text-right">
          <div className="stat-num text-[17px] leading-none text-ink">{dial.headV}</div>
          <div
            className="mt-[3px] text-[10px] [font-variant-numeric:tabular-nums]"
            style={{
              color:
                dial.tone === 'good'
                  ? 'var(--color-positive)'
                  : dial.tone === 'warn'
                    ? 'var(--color-ember)'
                    : 'var(--color-ink-dim)',
            }}
          >
            {dial.copy.headSub}
          </div>
        </div>
      </div>

      <p
        className="mt-[7px] border-l-2 pl-2.5 text-[11px] italic leading-normal text-ink-dim [text-wrap:pretty]"
        style={{ borderColor: tint(dial.color, 45) }}
      >
        {dial.copy.why}
      </p>

      {dial.kind === 'body' && dial.strains ? (
        <BodyPlates strains={dial.strains} muscle={muscle} onMuscle={setMuscle} />
      ) : (
        <div
          className="relative mt-2.5 h-[110px] cursor-crosshair touch-none"
          onPointerDown={move}
          onPointerMove={move}
          onPointerLeave={() => setScrub(null)}
          onPointerUp={() => setScrub(null)}
        >
          <svg
            width="100%"
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="block"
          >
            {p.areaD && <path d={p.areaD} style={{ fill: tint(dial.color, 13) }} />}
            {p.guideD && (
              <path
                d={p.guideD}
                fill="none"
                strokeWidth="1"
                strokeDasharray="3 3"
                style={{ stroke: 'color-mix(in srgb, var(--color-ink) 28%, transparent)' }}
              />
            )}
            {p.ruleD && (
              <path
                d={p.ruleD}
                fill="none"
                strokeWidth="1"
                strokeDasharray="2 3"
                style={{ stroke: 'color-mix(in srgb, var(--color-ink) 22%, transparent)' }}
              />
            )}
            {p.bars.map((b, i) => (
              <rect
                key={i}
                x={b.x.toFixed(1)}
                y={b.y.toFixed(1)}
                width={b.w.toFixed(1)}
                height={b.h.toFixed(1)}
                rx="1.5"
                style={{
                  fill: b.negative
                    ? tint('var(--color-danger)', b.active ? 90 : 45)
                    : tint(dial.color, b.active ? 88 : 38),
                }}
              />
            ))}
            {p.lineD && (
              <path
                d={p.lineD}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                style={{ stroke: dial.color }}
              />
            )}
            {p.dashD && (
              <path
                d={p.dashD}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="4 4"
                opacity="0.65"
                style={{ stroke: dial.color }}
              />
            )}
            {p.nowD && (
              <path
                d={p.nowD}
                fill="none"
                strokeWidth="1"
                strokeDasharray="2 3"
                style={{ stroke: 'color-mix(in srgb, var(--color-danger) 55%, transparent)' }}
              />
            )}
          </svg>
          {dial.rule && (
            <span
              className="absolute right-0.5 -translate-y-[115%] text-[8.5px] tracking-[0.12em] text-ink-faint"
              style={{ top: p.ruleTop }}
            >
              {dial.rule.label}
            </span>
          )}
          {scrub !== null && (
            <>
              {/* the dot is an HTML span, not an <circle>: the plot is drawn
                  with preserveAspectRatio="none" and a circle would render as
                  an ellipse at every card width but one */}
              <div
                aria-hidden
                className="pointer-events-none absolute bottom-0 top-0 w-px"
                style={{
                  left: p.scrubLeft,
                  background: 'color-mix(in srgb, var(--color-ink) 35%, transparent)',
                }}
              />
              <div
                aria-hidden
                className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
                style={{
                  left: p.scrubLeft,
                  top: p.scrubTop,
                  background: dial.color,
                  borderColor: 'var(--color-trough)',
                  boxShadow: `0 0 8px ${tint(dial.color, 55)}`,
                }}
              />
              <div
                className="menu-panel pointer-events-none absolute top-0.5 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-left"
                style={{ left: p.chipLeft }}
              >
                <div className="text-[8.5px] uppercase tracking-[0.1em] text-ink-dim [font-variant-numeric:tabular-nums]">
                  {dial.points[scrub].label}
                </div>
                <div className="stat-num text-[12.5px] text-ink">
                  {dial.fmtPoint
                    ? dial.fmtPoint(dial.points[scrub])
                    : dial.fmt(dial.points[scrub].v)}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-baseline justify-between border-t border-line pt-[5px] text-[9.5px] text-ink-faint [font-variant-numeric:tabular-nums]">
        <span>{dial.kind === 'body' ? 'FRONT' : first}</span>
        <span className="font-display text-[8.5px] font-semibold tracking-[0.16em]">
          {dial.range}
        </span>
        <span>{dial.kind === 'body' ? 'BACK' : last}</span>
      </div>

      {dial.kind === 'body' && muscle && (
        <div className="menu-panel pointer-events-none absolute right-2 top-2 whitespace-nowrap px-2.5 py-1 text-left">
          <div className="text-[8.5px] uppercase tracking-[0.1em] text-ink-dim">
            {muscleLabel(muscle)}
          </div>
          <div className="stat-num text-[12.5px] text-ink">
            {(dial.strains?.[muscle] ?? 0).toFixed(1)}
          </div>
        </div>
      )}
    </div>
  )
}

/** front and back, side by side, at card height */
function BodyPlates({
  strains,
  muscle,
  onMuscle,
}: {
  strains: NonNullable<Dial['strains']>
  muscle: MuscleId | null
  onMuscle: (m: MuscleId | null) => void
}) {
  const skin = SKINS[useShellStore((s) => s.skin)]
  const colorFor = (m: MuscleId) => strainToColor(strains[m], skin.heatRamp)
  const glowFor = (m: MuscleId) => glowOpacity(strains[m]) * (skin.glowScale ?? 1)

  return (
    <div className="mt-2.5 flex h-[110px] justify-center gap-6">
      <BodySvg
        view="front"
        colorFor={colorFor}
        glowFor={glowFor}
        selected={muscle}
        onSelect={onMuscle}
        className="block h-full w-auto"
      />
      <BodySvg
        view="back"
        colorFor={colorFor}
        glowFor={glowFor}
        selected={muscle}
        onSelect={onMuscle}
        className="block h-full w-auto"
      />
    </div>
  )
}
