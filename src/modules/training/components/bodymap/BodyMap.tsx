import { useMemo, useState } from 'react'
import type { BodyView, MuscleId, Workout } from '../../types'
import { MUSCLES, muscleLabel } from '../../data/muscles'
import type { StrainMap } from '../../lib/strain'
import { VISUAL_FLOOR, lastTrained } from '../../lib/strain'
import { glowOpacity, strainToColor } from '../../lib/strainColor'
import { SKINS } from '../../../../core/ui/skins'
import { useShellStore } from '../../../../core/store/shell'
import {
  VOLUME_COLORS,
  VOLUME_STATUS_LABEL,
  overreachingMuscles,
  volumeStatus,
  weeklyVolume,
} from '../../lib/volume'
import { relativeDayLabel } from '../../../../core/dates'
import { voice } from '../../../../core/voice'
import { SegmentedControl } from '../../../../core/ui/SegmentedControl'
import { BodySvg } from './BodySvg'
import { Legend, VolumeLegend } from './Legend'

type MapMode = 'strain' | 'volume'

interface BodyMapProps {
  workouts: Workout[]
  strains: StrainMap
  now: number
}

export function BodyMap({ workouts, strains, now }: BodyMapProps) {
  const skin = SKINS[useShellStore((s) => s.skin)]
  const weekStart = useShellStore((s) => s.weekStart)
  const [view, setView] = useState<BodyView>('front')
  const [mode, setMode] = useState<MapMode>(() =>
    import.meta.env.DEV && new URLSearchParams(window.location.search).get('map') === 'volume'
      ? 'volume'
      : 'strain',
  )
  const [selected, setSelected] = useState<MuscleId | null>(null)
  const debugRainbow = useMemo(
    () => import.meta.env.DEV && new URLSearchParams(window.location.search).has('debugmap'),
    [],
  )

  const vol = useMemo(() => weeklyVolume(workouts, new Date(now), weekStart), [workouts, now, weekStart])
  const over = useMemo(() => overreachingMuscles(vol), [vol])

  const colorFor =
    mode === 'strain'
      ? (m: MuscleId) => strainToColor(strains[m], skin.heatRamp)
      : (m: MuscleId) => VOLUME_COLORS[volumeStatus(m, vol[m])]
  const glowScale = skin.glowScale ?? 1
  const glowFor =
    mode === 'strain'
      ? (m: MuscleId) => glowOpacity(strains[m]) * glowScale
      : (m: MuscleId) => (volumeStatus(m, vol[m]) === 'over' ? 0.6 : 0) * glowScale

  const info = buildInfo()
  function buildInfo(): { text: string; dim: boolean } {
    if (!selected) {
      return {
        text: mode === 'strain' ? voice.grounds.mapIdleStrain : voice.grounds.mapIdleVolume,
        dim: true,
      }
    }
    if (mode === 'strain') {
      const strain = strains[selected]
      const last = lastTrained(workouts, selected)
      const parts = [`${MUSCLES[selected].label} — strain ${strain.toFixed(1)}`]
      if (last) {
        const label = relativeDayLabel(last.performedAt, new Date(now))
        parts.push(
          `trained ${label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : label}`,
        )
      } else if (strain < VISUAL_FLOOR) {
        parts.push('fully recovered')
      }
      return { text: parts.join(' · '), dim: false }
    }
    const sets = vol[selected]
    const status = volumeStatus(selected, sets)
    return {
      text: `${MUSCLES[selected].label} — ~${sets.toFixed(0)} set${sets < 1.5 ? '' : 's'} this week · ${VOLUME_STATUS_LABEL[status]}`,
      dim: false,
    }
  }

  const svgClass = 'h-[50dvh] max-h-[440px] min-h-[300px] w-auto select-none'

  return (
    <section className="panel panel-hero px-4 pb-4 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="card-title">Muscle Status</h2>
        <SegmentedControl
          options={[
            { value: 'strain', label: 'Strain' },
            { value: 'volume', label: 'Volume' },
          ]}
          value={mode}
          onChange={(m) => setMode(m as MapMode)}
        />
      </div>

      <div className="mb-1 flex justify-center lg:hidden">
        <SegmentedControl
          options={[
            { value: 'front', label: 'Front' },
            { value: 'back', label: 'Back' },
          ]}
          value={view}
          onChange={(v) => setView(v as BodyView)}
        />
      </div>

      {/* The stage: the figures stand in a recess rather than floating on the
          panel, with a wash in the wing's own colour and a line to stand on. */}
      <div className="trough relative overflow-hidden px-2 pb-2 pt-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 68% 55% at 50% 45%, color-mix(in srgb, var(--color-w-grounds) 9%, transparent), transparent 72%)',
          }}
        />

        {/* The readout floats ON the stage — pointer-events-none so it can
            never intercept a tap meant for a plate underneath it.
            Below sm it stays IN FLOW: at 320px a two-line readout ("Hamstrings
            — strain 6.7 · trained Sun, Jul 26") reaches down over the trapezius
            plate, dulling the very colour the map exists to show. Narrow
            screens get the honest layout; wider ones get the floating card.
            aria-hidden because the sr-only live region below carries it — a
            screen reader should not meet the same sentence twice. */}
        <div
          aria-hidden
          className="pointer-events-none static z-[2] mb-1 flex sm:absolute sm:inset-x-3 sm:top-3 sm:mb-0"
        >
          <span
            className={`subcard max-w-full px-2.5 py-1.5 text-[12px] leading-snug ${
              info.dim ? 'text-ink-faint' : 'text-ink-dim'
            } ${skin.figCaption ? 'font-display italic' : ''}`}
            style={{ background: 'color-mix(in srgb, var(--color-subcard) 78%, transparent)' }}
          >
            {skin.figCaption ? `fig. 1 — ${info.text}` : info.text}
          </span>
        </div>

        <div className="relative flex items-center justify-center gap-8">
          <BodySvg
            view="front"
            colorFor={colorFor}
            glowFor={glowFor}
            selected={selected}
            onSelect={setSelected}
            debugRainbow={debugRainbow}
            className={`${view === 'front' ? '' : 'hidden'} lg:block ${svgClass}`}
          />
          <BodySvg
            view="back"
            colorFor={colorFor}
            glowFor={glowFor}
            selected={selected}
            onSelect={setSelected}
            debugRainbow={debugRainbow}
            className={`${view === 'back' ? '' : 'hidden'} lg:block ${svgClass}`}
          />
        </div>

        {/* Ghost Protocol: hologram floor reflection + its own ground line */}
        {skin.reflection ? (
          <>
            <div
              aria-hidden
              className="map-reflection -mt-1 flex h-14 items-end justify-center gap-8 overflow-hidden"
            >
              <BodySvg
                view="front"
                colorFor={colorFor}
                glowFor={() => 0}
                selected={null}
                onSelect={() => {}}
                decorative
                className={`${view === 'front' ? '' : 'hidden'} lg:block ${svgClass}`}
              />
              <BodySvg
                view="back"
                colorFor={colorFor}
                glowFor={() => 0}
                selected={null}
                onSelect={() => {}}
                decorative
                className={`${view === 'back' ? '' : 'hidden'} lg:block ${svgClass}`}
              />
            </div>
            <div
              aria-hidden
              className="mx-auto -mt-px h-px w-44"
              style={{
                background:
                  'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent) 40%, transparent), transparent)',
              }}
            />
          </>
        ) : (
          /* the figures need something to stand on, or they hang in the recess */
          <div
            aria-hidden
            className="mx-auto mt-1 h-px w-2/3"
            style={{
              background:
                'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-w-grounds) 34%, transparent), transparent)',
            }}
          />
        )}
      </div>

      {/* the readout is announced from here — the visible copy floats on the
          stage above, but a live region must not also be a positioned overlay
          that screen readers reach out of document order */}
      <p className="sr-only" aria-live="polite">
        {info.text}
      </p>

      <div className="mt-3 flex justify-center">
        {mode === 'strain' ? <Legend ramp={skin.heatRamp} /> : <VolumeLegend />}
      </div>

      {over.length >= 2 && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm">
          <span className="font-display font-bold uppercase tracking-[0.12em] text-danger">
            {voice.grounds.deloadTitle}
          </span>
          <span className="ml-2 text-ink-dim">
            {voice.grounds.deload({
              count: over.length,
              muscles: over.slice(0, 3).map(muscleLabel).join(', ') + (over.length > 3 ? '…' : ''),
            })}
          </span>
        </div>
      )}
    </section>
  )
}
