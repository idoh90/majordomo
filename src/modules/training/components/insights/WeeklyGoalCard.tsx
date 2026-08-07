import { useEffect, useState } from 'react'
import type { Workout } from '../../types'
import { GROUP_LABELS } from '../../data/muscles'
import { slackingGroups, thisWeekCount } from '../../lib/insights'
import { MAX_WEEKLY_GOAL, useWorkoutStore } from '../../store'
import { useShellStore } from '../../../../core/store/shell'
import { Hinted } from '../../../../core/ui/Hint'
import { voice } from '../../../../core/voice'

interface WeeklyGoalCardProps {
  workouts: Workout[]
  now: number
}

export function WeeklyGoalCard({ workouts, now }: WeeklyGoalCardProps) {
  const goal = useWorkoutStore((s) => s.weeklyGoal)
  const setWeeklyGoal = useWorkoutStore((s) => s.setWeeklyGoal)
  const weekStart = useShellStore((s) => s.weekStart)
  const [editing, setEditing] = useState(false)

  const nowDate = new Date(now)
  const done = thisWeekCount(workouts, nowDate, weekStart)
  const slacking = slackingGroups(workouts, nowDate, weekStart)
  const hasGoal = goal > 0
  const met = hasGoal && done >= goal
  const remaining = Math.max(0, goal - done)

  return (
    <div
      className={`panel p-4 transition-colors ${met ? 'border-accent/60' : ''}`}
    >
      <Hinted tip={voice.hints.grounds.weekGoal}>
      <div className="flex items-start justify-between">
        <div>
          <div className="card-title">{voice.grounds.weekTitle}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="stat-num text-3xl leading-none text-ink">{done}</span>
            {hasGoal && (
              <span className="stat-num text-xl leading-none text-ink-faint">/ {goal}</span>
            )}
            <span className="ml-1 text-sm text-ink-faint">
              workout{done === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg border border-line px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          {hasGoal ? 'Goal' : 'Set goal'}
        </button>
      </div>
      </Hinted>

      {hasGoal && (
        <>
          {/* One cell per session the week asks for, rather than a bar. A goal
              of four is four countable things; a continuous bar made "three of
              four" something you had to estimate off a length. Above the goal
              the extras keep their own cells so an over-delivered week still
              reads honestly instead of pinning at full. */}
          <div className="mt-3 flex gap-1" aria-hidden>
            {Array.from({ length: Math.max(goal, done) }, (_, i) => (
              <span
                key={i}
                className="h-2 flex-1 rounded-pill transition-colors duration-300"
                style={{
                  background:
                    i < done
                      ? i < goal
                        ? 'var(--color-accent)'
                        : 'color-mix(in srgb, var(--color-positive) 70%, transparent)'
                      : 'var(--color-panel-2)',
                }}
              />
            ))}
          </div>
          <div className="mt-1.5 text-sm">
            {met ? (
              <span className="font-medium text-accent">{voice.grounds.goalMet}</span>
            ) : (
              <span className="text-ink-dim">{voice.grounds.goalRemaining(remaining)}</span>
            )}
          </div>
        </>
      )}

      {slacking.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <div className="card-title text-[10px]">{voice.grounds.slackingTitle}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {slacking.map((s) => (
              <span
                key={s.group}
                className="chip border border-danger/40 bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-ink"
                title={voice.grounds.slackingDetail({
                  group: GROUP_LABELS[s.group],
                  thisWeek: s.thisWeek,
                  baseline: s.baseline,
                })}
              >
                {GROUP_LABELS[s.group]}
              </span>
            ))}
          </div>
        </div>
      )}

      {editing && (
        <GoalDialog
          initial={goal}
          onCancel={() => setEditing(false)}
          onSave={(g) => {
            setWeeklyGoal(g)
            setEditing(false)
          }}
        />
      )}
    </div>
  )
}

function GoalDialog({
  initial,
  onCancel,
  onSave,
}: {
  initial: number
  onCancel: () => void
  onSave: (goal: number) => void
}) {
  const [value, setValue] = useState(initial || 4)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div
        className="sheet-backdrop absolute inset-0 animate-[fade-in_150ms_ease-out] backdrop-blur-[2px]"
        onPointerDown={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="sheet-surface relative w-full max-w-xs animate-[step-in_180ms_ease-out] rounded-2xl border p-5"
      >
        <h3 className="font-display text-lg font-bold tracking-wide">
          {voice.grounds.goalDialogTitle}
        </h3>
        <p className="mt-1 text-sm text-ink-dim">{voice.grounds.goalDialogBody}</p>

        <div className="mt-5 flex items-center justify-center gap-5">
          <Stepper
            label="Decrease"
            disabled={value <= 0}
            onClick={() => setValue((v) => Math.max(0, v - 1))}
          >
            −
          </Stepper>
          <div className="text-center">
            <div className="stat-num text-5xl leading-none text-accent">{value}</div>
            <div className="mt-1 text-xs text-ink-faint">
              {value === 0 ? voice.grounds.goalNone : voice.grounds.goalPerWeek}
            </div>
          </div>
          <Stepper
            label="Increase"
            disabled={value >= MAX_WEEKLY_GOAL}
            onClick={() => setValue((v) => Math.min(MAX_WEEKLY_GOAL, v + 1))}
          >
            +
          </Stepper>
        </div>

        <div className="mt-6 flex gap-2">
          <button type="button" onClick={onCancel} className="btn-soft flex-1 py-2.5 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(value)}
            className="btn-cta flex-1 py-2.5 text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Stepper({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="card chip flex h-12 w-12 items-center justify-center font-display text-2xl font-bold text-ink transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-ink"
    >
      {children}
    </button>
  )
}
