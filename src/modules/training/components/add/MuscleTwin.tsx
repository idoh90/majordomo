import { useMemo } from 'react'
import type { MuscleId, Workout } from '../../types'
import { useShellStore } from '../../../../core/store/shell'
import { SKINS } from '../../../../core/ui/skins'
import { voice } from '../../../../core/voice'
import { useRecoveryScale } from '../../../../core/sleep/useSleep'
import { projectedStrains, selectionCounts, selectionShape, type DraftSession } from '../../lib/gymEffort'
import { glowOpacity, strainToColor } from '../../lib/strainColor'
import { BodySvg } from '../bodymap/BodySvg'
import type { Selection } from './AddWorkoutSheet'

const noop = () => {}

interface MuscleTwinProps {
  selection: Selection
  /** the log this session lands on top of — WITHOUT the session being edited,
   *  or its stored copy and its draft would both be counted */
  workouts: Workout[]
  /** the draft as the strain engine would price it */
  draft: DraftSession
  nowMs: number
  /** the effort the picks currently earn — drives the ambient panel warmth */
  eff: number
  /** what Continue will hand the effort step, or null while resting/held */
  prefill: number | null
}

/**
 * The body-map twin ("Run Entry Explorations" 3a): the real front/back plates
 * in miniature. The plates carry the WHOLE body's strain — what the log
 * already says you are carrying, plus what these picks would add — so the
 * figure answers "what shape am I in" and not merely "what did I tap". The
 * picks themselves read as accent rings over that, since a muscle sore from
 * Tuesday and a muscle you just chose would otherwise look identical.
 */
export function MuscleTwin({
  selection,
  workouts,
  draft,
  nowMs,
  eff,
  prefill,
}: MuscleTwinProps) {
  const skin = SKINS[useShellStore((s) => s.skin)]
  const twin = voice.grounds.muscleTwin

  const scale = useRecoveryScale()
  const strains = useMemo(
    () => projectedStrains(workouts, selection, draft, nowMs, scale),
    [workouts, selection, draft, nowMs, scale],
  )

  const glowScale = skin.glowScale ?? 1
  const colorFor = (m: MuscleId) => strainToColor(strains[m], skin.heatRamp)
  const glowFor = (m: MuscleId) => glowOpacity(strains[m]) * glowScale
  const markFor = (m: MuscleId) => selection[m] ?? null

  const { p, s } = selectionCounts(selection)
  const shape = selectionShape(selection)
  const chipLabel =
    shape === null ? twin.shapeNone : shape === 'custom' ? twin.shapeCustom : twin.shape[shape]
  // the ambient wash is this SESSION's heat, not the body's — kept low so it
  // never competes with the per-muscle glow, which is the truthful one
  const figGlow = Math.min(0.4, eff * 0.045) * glowScale

  return (
    <div
      className="flex items-center gap-4 rounded-xl border bg-bg px-3.5 py-3 transition-colors duration-500"
      style={{ borderColor: 'var(--heat-line)' }}
    >
      <div aria-hidden className="pointer-events-none relative flex shrink-0 gap-3">
        <div
          className="absolute -inset-2.5 transition-opacity duration-500"
          style={{
            background: 'radial-gradient(circle at 50% 45%, var(--heat-soft), transparent 72%)',
            opacity: figGlow,
          }}
        />
        {(['front', 'back'] as const).map((view) => (
          <div key={view} className="relative flex flex-col items-center gap-1">
            <BodySvg
              view={view}
              colorFor={colorFor}
              glowFor={glowFor}
              markFor={markFor}
              selected={null}
              onSelect={noop}
              decorative
              className="h-[110px] w-[50px]"
            />
            <span className="font-display text-[9px] font-semibold tracking-[0.2em] text-ink-faint">
              {twin[view]}
            </span>
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-[7px]">
        <span
          className="self-start rounded-pill border px-2.5 py-[3px] font-display text-[11px] font-bold tracking-[0.1em] transition-colors duration-300"
          style={{
            background: 'var(--heat-soft)',
            borderColor: 'var(--heat-line)',
            color: 'var(--heat)',
          }}
        >
          {chipLabel}
        </span>
        <span className="text-xs leading-relaxed text-ink-dim">
          {p + s > 0 ? twin.counts({ p, s }) : twin.countsNone}
        </span>
        <div className="flex items-center gap-[7px]">
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full transition-colors duration-300"
            style={{ background: 'var(--heat)', boxShadow: '0 0 8px var(--heat-soft)' }}
          />
          <span className="text-xs text-ink-dim">
            {prefill !== null ? twin.effortPrefill({ n: prefill }) : twin.effortIdle}
          </span>
        </div>
      </div>
    </div>
  )
}
