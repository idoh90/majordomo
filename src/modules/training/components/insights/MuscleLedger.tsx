import { useMemo } from 'react'
import { useShellStore } from '../../../../core/store/shell'
import { SKINS } from '../../../../core/ui/skins'
import { voice } from '../../../../core/voice'
import { ALL_MUSCLE_IDS, GROUP_LABELS, PICKER_GROUPS, muscleLabel } from '../../data/muscles'
import type { MuscleId, Workout } from '../../types'
import { HOT_THRESHOLD } from '../../lib/recovery'
import { MAX_STRAIN, type StrainMap } from '../../lib/strain'
import { strainToColor } from '../../lib/strainColor'
import {
  VOLUME_COLORS,
  VOLUME_STATUS_LABEL,
  volumeStatus,
  weeklyVolume,
} from '../../lib/volume'

/**
 * THE MUSCLE LEDGER — the body map's data twin.
 *
 * The silhouettes answer "where am I sore" at a glance and nothing else: to
 * read a figure off them you have to click a plate, one at a time, and only
 * one muscle can be selected at once. This states all sixteen at once —
 * strain, this week's estimated hard sets, and where that sits against the
 * muscle's own landmarks.
 *
 * It takes `strains` as a prop rather than computing them. computeStrains
 * walks every workout against a recovery envelope; calling it per row would
 * run it sixteen times for one screen. The screen computes it once and the
 * map and the ledger read the same map, so the two can never disagree about
 * how hot a muscle is.
 */
export function MuscleLedger({
  workouts,
  strains,
  now,
}: {
  workouts: Workout[]
  strains: StrainMap
  now: number
}) {
  const skin = SKINS[useShellStore((s) => s.skin)]
  const weekStart = useShellStore((s) => s.weekStart)

  // weekly volume only changes at a week boundary, so key the memo to the hour
  // rather than to the minute-ticking clock — the house idiom for anything
  // that walks the whole workout history
  const nowH = Math.floor(now / 3_600_000) * 3_600_000
  const vol = useMemo(
    () => weeklyVolume(workouts, new Date(nowH), weekStart),
    [workouts, nowH, weekStart],
  )
  const hot = ALL_MUSCLE_IDS.filter((m) => strains[m] >= HOT_THRESHOLD).length

  return (
    <section className="panel px-4 pb-4 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="card-title">{voice.grounds.ledger.title}</h2>
        <span className="chip-tint px-2.5 py-1 text-[10px] tracking-[0.12em] text-ink-dim">
          <span className="text-ink-faint">{voice.grounds.ledger.hotNow} </span>
          <span className="stat-num text-ink">
            {voice.grounds.ledger.hotNowValue({ hot, total: ALL_MUSCLE_IDS.length })}
          </span>
        </span>
      </div>

      {/* Strain decays from every session ever logged; sets count only this
          calendar week's lifting. Without the window spelled out, a muscle
          worked last Saturday reads "10.0" beside "—" and looks like the
          panel arguing with itself. */}
      <div className="mt-3 flex items-center gap-2.5 border-b border-line pb-1 text-[9px] uppercase tracking-[0.14em] text-ink-faint">
        <span className="w-[74px] flex-none" />
        <span className="min-w-0 flex-1" />
        <span className="w-8 flex-none text-right">{voice.grounds.ledger.colStrain}</span>
        <span className="w-[68px] flex-none text-right">{voice.grounds.ledger.colSets}</span>
      </div>

      <div className="mt-2 flex flex-col gap-3">
        {PICKER_GROUPS.map(({ group, muscles }) => (
          <div key={group}>
            <div className="text-[9px] uppercase tracking-[0.18em] text-ink-faint">
              {GROUP_LABELS[group]}
            </div>
            <ul className="mt-1 flex flex-col">
              {muscles.map((m) => (
                <Row key={m} id={m} strain={strains[m]} sets={vol[m]} ramp={skin.heatRamp} />
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
        {voice.grounds.ledger.note}
      </p>
    </section>
  )
}

function Row({
  id,
  strain,
  sets,
  ramp,
}: {
  id: MuscleId
  strain: number
  sets: number
  ramp: 'standard' | 'noir' | 'daylight'
}) {
  const status = volumeStatus(id, sets)
  const isHot = strain >= HOT_THRESHOLD
  return (
    <li className="flex items-center gap-2.5 border-b border-line py-1.5 last:border-b-0">
      <span className="w-[74px] flex-none truncate text-[12px] text-ink-dim">
        {muscleLabel(id)}
      </span>

      {/* the same ramp the silhouettes paint from, so a hot plate and a long
          bar are the same fact rendered twice rather than two opinions */}
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-panel-2">
        <span
          className="block h-full rounded-pill"
          style={{
            width: `${Math.min(100, (strain / MAX_STRAIN) * 100)}%`,
            background: strainToColor(strain, ramp),
          }}
        />
      </span>

      <span
        className="stat-num w-8 flex-none text-right text-[12px]"
        style={{ color: isHot ? strainToColor(strain, ramp) : 'var(--color-ink-dim)' }}
      >
        {strain.toFixed(1)}
      </span>

      <span className="flex w-[68px] flex-none items-center justify-end gap-1.5">
        <span className="text-[11px] text-ink-faint [font-variant-numeric:tabular-nums]">
          {sets > 0 ? voice.grounds.ledger.sets(Math.round(sets)) : '—'}
        </span>
        {/* No lifting sets means there is no landmark to be measured against,
            so the row says nothing rather than labelling a muscle that is
            plainly still hot "not trained yet". The dot is also the least
            visible thing on the panel at that status. */}
        {status !== 'none' && (
          <>
            <span
              aria-hidden
              className="h-2 w-2 flex-none rounded-full"
              style={{ background: VOLUME_COLORS[status] }}
            />
            <span className="sr-only">{VOLUME_STATUS_LABEL[status]}</span>
          </>
        )}
      </span>
    </li>
  )
}
