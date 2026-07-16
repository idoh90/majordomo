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
        text: mode === 'strain' ? 'Tap a muscle for details' : 'Weekly volume vs your targets',
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

      <div className="flex items-center justify-center gap-8">
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

      {/* Ghost Protocol: hologram floor reflection + ground line */}
      {skin.reflection && (
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
              className={`${view === 'front' ? '' : 'hidden'} lg:block ${svgClass}`}
            />
            <BodySvg
              view="back"
              colorFor={colorFor}
              glowFor={() => 0}
              selected={null}
              onSelect={() => {}}
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
      )}

      <p className="mt-2 min-h-5 text-center text-sm" aria-live="polite">
        <span
          className={`${info.dim ? 'text-ink-faint' : 'text-ink-dim'} ${
            skin.figCaption ? 'font-display italic' : ''
          }`}
        >
          {skin.figCaption ? `fig. 1 — ${info.text}` : info.text}
        </span>
      </p>

      <div className="mt-3 flex justify-center">
        {mode === 'strain' ? <Legend ramp={skin.heatRamp} /> : <VolumeLegend />}
      </div>

      {over.length >= 2 && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-sm">
          <span className="font-display font-bold uppercase tracking-[0.12em] text-danger">
            Deload check
          </span>
          <span className="ml-2 text-ink-dim">
            {over.length} muscles are overreaching this week (
            {over.slice(0, 3).map(muscleLabel).join(', ')}
            {over.length > 3 ? '…' : ''}). A lighter session or an extra rest day helps.
          </span>
        </div>
      )}
    </section>
  )
}
