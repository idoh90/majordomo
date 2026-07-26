import { useState } from 'react'
import type { MuscleId, Workout } from '../../types'
import { MUSCLES, PPL_LABELS } from '../../data/muscles'
import { hoursBetween, relativeDayLabel, timeLabel } from '../../../../core/dates'
import {
  MAX_STRAIN,
  REP_STYLES,
  recoveryPhase,
  repStyleOf,
  workoutActivity,
  workoutContribution,
} from '../../lib/strain'
import { strainToColor } from '../../lib/strainColor'
import { SKINS } from '../../../../core/ui/skins'
import { useShellStore } from '../../../../core/store/shell'
import { useWorkoutStore } from '../../store'
import { ConfirmDialog } from '../../../../core/ui/ConfirmDialog'
import { Sheet } from '../../../../core/ui/Sheet'

interface WorkoutDetailSheetProps {
  workout: Workout | null
  now: number
  onClose: () => void
  onEdit: (w: Workout) => void
}

export function WorkoutDetailSheet({ workout, now, onClose, onEdit }: WorkoutDetailSheetProps) {
  const deleteWorkout = useWorkoutStore((s) => s.deleteWorkout)
  const heatRamp = SKINS[useShellStore((s) => s.skin)].heatRamp
  const [confirming, setConfirming] = useState(false)

  if (!workout) return null
  const w = workout

  const activity = workoutActivity(w, now)
  const phase = recoveryPhase(w, now)
  const dt = hoursBetween(w.performedAt, now)
  const agoLabel = dt < 1 ? 'just now' : dt < 48 ? `${Math.round(dt)}h ago` : `${Math.round(dt / 24)}d ago`
  const style = repStyleOf(w)

  const PHASE_COPY: Record<typeof phase, string> = {
    fresh: 'Acute fatigue is at its peak right now.',
    peaking: 'Soreness is still building toward its peak.',
    easing: 'Past the peak — soreness is easing off.',
    recovered: 'Fully recovered — this workout no longer adds strain.',
  }

  const muscles: { id: MuscleId; kind: 'primary' | 'secondary' }[] = [
    ...w.primary.map((id) => ({ id, kind: 'primary' as const })),
    ...w.secondary.map((id) => ({ id, kind: 'secondary' as const })),
  ]

  return (
    <Sheet open onClose={onClose}>
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-md border border-accent/60 px-1.5 py-px font-display text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
          {w.ppl ? PPL_LABELS[w.ppl] : 'Custom'}
        </span>
        <h2 className="font-display text-xl font-bold tracking-wide">
          {relativeDayLabel(w.performedAt, new Date(now))}
          <span className="ml-2 text-sm font-semibold text-ink-faint">
            {timeLabel(w.performedAt)}
          </span>
        </h2>
      </div>
      <p className="mb-4 text-xs text-ink-faint">
        {REP_STYLES[style].title} · {REP_STYLES[style].caption}
      </p>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <ScoreTile label="Effort given" value={w.effort} barClass="bg-accent" />
        <ScoreTile label="Felt strain" value={w.strainFeel} barClass="bg-ember" />
      </div>

      <h3 className="mb-1 font-display text-xs font-bold uppercase tracking-[0.2em] text-ink-dim">
        Impact on strain now
      </h3>
      <p className="mb-1 text-sm text-ink-dim">
        Trained {agoLabel}
        {phase !== 'recovered' && (
          <>
            {' — '}
            <span className="font-semibold text-accent">{Math.round(activity * 100)}%</span> of
            its peak impact
          </>
        )}
        .
      </p>
      <p className="mb-3 text-xs text-ink-faint">{PHASE_COPY[phase]}</p>

      <div className="flex flex-col gap-2">
        {muscles.map(({ id, kind }) => {
          const current = workoutContribution(w, id, now)
          return (
            <div key={id} className="flex items-center gap-2.5">
              <span
                className={`w-24 shrink-0 truncate text-xs ${
                  kind === 'primary' ? 'font-semibold text-ink' : 'text-ink-dim'
                }`}
              >
                {MUSCLES[id].label}
                {kind === 'secondary' && <span className="ml-1 text-ink-faint">½</span>}
              </span>
              <div className="chip h-2.5 flex-1 overflow-hidden bg-panel-2">
                <div
                  className="chip h-full transition-[width]"
                  style={{
                    width: `${Math.min(MAX_STRAIN, current) * 10}%`,
                    background: strainToColor(current, heatRamp),
                  }}
                />
              </div>
              {/* one workout can contribute past the 0–10 the rest of the app
                  reads on (a maximal session peaks near 11.5), and the bar has
                  always pinned at full — so the number says so instead of
                  printing an off-scale figure */}
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink">
                {current > MAX_STRAIN ? `>${MAX_STRAIN}` : current.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-right text-[10px] uppercase tracking-[0.16em] text-ink-faint">
        strain contributed now
      </p>

      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => onEdit(w)} className="btn-cta flex-1 py-3 text-sm">
          Edit
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex-1 rounded-xl border border-danger/50 py-3 font-display text-sm font-bold uppercase tracking-[0.16em] text-danger transition-colors hover:bg-danger/10"
        >
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={confirming}
        title="Delete workout?"
        message="This can't be undone."
        confirmLabel="Delete"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          deleteWorkout(w.id)
          onClose()
        }}
      />
    </Sheet>
  )
}

function ScoreTile({
  label,
  value,
  barClass,
}: {
  label: string
  value: number
  barClass: string
}) {
  return (
    <div className="card px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-dim">{label}</span>
        <span className="stat-num text-2xl leading-none text-ink">{value}</span>
      </div>
      <div className="chip mt-2 h-1.5 overflow-hidden bg-panel-3">
        <div className={`chip h-full ${barClass}`} style={{ width: `${value * 10}%` }} />
      </div>
    </div>
  )
}
