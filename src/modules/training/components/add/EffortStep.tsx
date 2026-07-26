import { useState } from 'react'
import { MUSCLES } from '../../data/muscles'
import type { MuscleId, RepStyle, Workout } from '../../types'
import { relativeDayLabel, timeLabel } from '../../../../core/dates'
import { REP_STYLES } from '../../lib/strain'
import { CalendarPicker } from '../ui/CalendarPicker'
import { Slider } from '../ui/Slider'
import type { Selection } from './AddWorkoutSheet'
import { BlockLinkNote, type BlockLink } from './BlockLinkNote'

const REP_STYLE_ORDER: RepStyle[] = ['light', 'mixed', 'heavy']

interface EffortStepProps {
  /** runs have no rep style — the eccentric load is fixed by the sport */
  isRun?: boolean
  selection: Selection
  effort: number
  strainFeel: number
  repStyle: RepStyle
  onEffort: (v: number) => void
  onStrainFeel: (v: number) => void
  onRepStyle: (s: RepStyle) => void
  editing: boolean
  performedAt: string
  onPerformedAt: (iso: string) => void
  workouts: Workout[]
  onSave: () => void
  /** log-fulfills-block note ("This fulfils today's 7:15 AM block, sir.") —
   *  tappable into a picker when several blocks are in range */
  blockLink?: BlockLink | null
  /** dev screenshot aid — start with the calendar expanded */
  whenInitiallyOpen?: boolean
}

export function EffortStep({
  isRun = false,
  selection,
  effort,
  strainFeel,
  repStyle,
  onEffort,
  onStrainFeel,
  onRepStyle,
  editing,
  performedAt,
  onPerformedAt,
  workouts,
  onSave,
  blockLink,
  whenInitiallyOpen,
}: EffortStepProps) {
  const [whenOpen, setWhenOpen] = useState(whenInitiallyOpen ?? false)

  const entries = Object.entries(selection).filter(([, v]) => v !== undefined) as [
    MuscleId,
    'primary' | 'secondary',
  ][]
  const primary = entries.filter(([, v]) => v === 'primary').map(([m]) => m)
  const secondary = entries.filter(([, v]) => v === 'secondary').map(([m]) => m)

  const now = new Date()
  const dayLabel = relativeDayLabel(performedAt, now)
  const whenLabel = `${dayLabel} · ${timeLabel(performedAt)}`

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {primary.map((m) => (
          <span key={m} className="chip bg-accent px-2.5 py-0.5 text-xs font-semibold text-bg">
            {MUSCLES[m].label}
          </span>
        ))}
        {secondary.map((m) => (
          <span
            key={m}
            className="chip border border-accent/60 px-2.5 py-0.5 text-xs text-accent"
          >
            {MUSCLES[m].label}
          </span>
        ))}
      </div>

      <div className={`mb-5 ${isRun ? 'hidden' : ''}`}>
        <span className="mb-1.5 block text-sm font-medium text-ink-dim">Workout style</span>
        <div className="flex gap-1.5" role="radiogroup" aria-label="Workout style">
          {REP_STYLE_ORDER.map((s) => {
            const active = repStyle === s
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onRepStyle(s)}
                className={`card flex-1 px-1 py-2 text-center transition-colors ${
                  active ? 'border-accent bg-accent/10' : 'hover:border-accent/40'
                }`}
              >
                <div
                  className={`font-display text-sm font-bold uppercase tracking-[0.08em] ${
                    active ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {REP_STYLES[s].title}
                </div>
                <div className="text-[10px] leading-tight text-ink-faint">
                  {REP_STYLES[s].caption}
                </div>
              </button>
            )
          })}
        </div>
        {repStyle !== 'mixed' && (
          <p className="mt-1.5 text-xs text-ink-faint">
            {repStyle === 'heavy'
              ? 'Heavy work hits harder and takes longer to recover from.'
              : 'High-rep work is lighter on the muscle and recovers faster.'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <Slider label="Effort given" value={effort} onChange={onEffort} />
        <Slider label="How strained it feels" value={strainFeel} onChange={onStrainFeel} />
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setWhenOpen((v) => !v)}
          aria-expanded={whenOpen}
          className="card flex w-full items-center justify-between px-3.5 py-3 transition-colors hover:border-accent/40"
        >
          <span className="flex items-center gap-2.5 text-sm text-ink-dim">
            <CalendarIcon />
            When
          </span>
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            {whenLabel}
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
              className={`text-ink-faint transition-transform ${whenOpen ? 'rotate-180' : ''}`}
            >
              <path
                d="m5 7.5 5 5 5-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        {whenOpen && (
          <div className="mt-2 animate-[step-in_180ms_ease-out]">
            <CalendarPicker value={performedAt} onChange={onPerformedAt} workouts={workouts} />
          </div>
        )}
      </div>

      {blockLink && <BlockLinkNote {...blockLink} />}
      <button
        type="button"
        onClick={onSave}
        className={`btn-cta w-full py-3.5 text-lg transition active:scale-[0.99] ${blockLink ? 'mt-2.5' : 'mt-6'}`}
      >
        {editing ? 'Save Changes' : isRun ? 'Save Run' : 'Save Workout'}
      </button>
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15.5"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M3.5 9.5h17" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 3v3.5M16 3v3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
