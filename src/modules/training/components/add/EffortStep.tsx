import { useState } from 'react'
import { MUSCLES } from '../../data/muscles'
import type { MuscleId, RepStyle, Workout } from '../../types'
import { relativeDayLabel, timeLabel } from '../../../../core/dates'
import { voice } from '../../../../core/voice'
import { Collapsible } from '../../../../core/ui/Collapsible'
import { CollapseChevron } from '../../../../core/ui/CollapseToggle'
import { REP_STYLES } from '../../lib/strain'
import { sessionBudget } from '../../lib/volume'
import { CalendarPicker } from '../ui/CalendarPicker'
import { Field } from '../ui/Field'
import { Slider } from '../ui/Slider'
import type { Selection } from './AddWorkoutSheet'
import { BlockLinkNote, type BlockLink } from './BlockLinkNote'

const REP_STYLE_ORDER: RepStyle[] = ['light', 'mixed', 'heavy']

interface EffortStepProps {
  /** runs have no rep style — the eccentric load is fixed by the sport */
  isRun?: boolean
  /** sport sessions fix their rep character in SPORT_MAP, like runs do */
  isSport?: boolean
  selection: Selection
  effort: number
  strainFeel: number
  repStyle: RepStyle
  /** lift session size, string-valued like the run fields — '' = not recorded */
  setsTotal: string
  durationMin: string
  /** present when the session was logged exercise by exercise: its size is
   *  then a COUNT, not an estimate, so the sets field is replaced by what the
   *  log adds up to. A box that accepts a number and then overwrites it is the
   *  Ledger's cardinal sin — display one number, store another. */
  countedSets?: { sets: number; exercises: number } | null
  onEffort: (v: number) => void
  onStrainFeel: (v: number) => void
  onRepStyle: (s: RepStyle) => void
  onSession: (patch: Partial<{ setsTotal: string; durationMin: string }>) => void
  editing: boolean
  performedAt: string
  onPerformedAt: (iso: string) => void
  workouts: Workout[]
  onSave: () => void
  /** a refusal standing between the draft and the store — a run that states
   *  neither a distance nor a clock has nothing to record, so Save is shut and
   *  this prints under it. null saves as normal. */
  saveBlocked?: string | null
  /** log-fulfills-block note ("This fulfils today's 7:15 AM block, sir.") —
   *  tappable into a picker when several blocks are in range */
  blockLink?: BlockLink | null
  /** dev screenshot aid — start with the calendar expanded */
  whenInitiallyOpen?: boolean
}

export function EffortStep({
  isRun = false,
  isSport = false,
  selection,
  effort,
  strainFeel,
  repStyle,
  setsTotal,
  durationMin,
  countedSets = null,
  onEffort,
  onStrainFeel,
  onRepStyle,
  onSession,
  editing,
  performedAt,
  onPerformedAt,
  workouts,
  onSave,
  saveBlocked = null,
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

  // the sets placeholder is the estimate a typed count would replace, built
  // live from the picks, the effort, and any typed duration — so entering a
  // duration visibly moves the estimate it feeds
  const typedMin = Number(durationMin)
  const budgetPreview = Math.round(
    sessionBudget({
      primary,
      secondary,
      effort,
      durationMin: Number.isFinite(typedMin) && typedMin > 0 ? typedMin : undefined,
    }),
  )

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

      <div className={`mb-5 ${isRun || isSport ? 'hidden' : ''}`}>
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

      {!isRun && !isSport && (
        <div className="mt-5" role="group" aria-label={voice.grounds.sessionSizeTitle}>
          <div className="flex gap-2.5">
            {countedSets ? (
              <p className="flex-1 self-end text-xs text-ink-dim">
                {voice.grounds.exercises.derivedSets(countedSets)}
              </p>
            ) : (
              <Field
                label={voice.grounds.sessionSetsLabel}
                unit={voice.grounds.sessionSetsUnit}
                value={setsTotal}
                onChange={(v) => onSession({ setsTotal: v })}
                placeholder={`~${budgetPreview}`}
                step="1"
                max={60}
              />
            )}
            <Field
              label={voice.grounds.sessionMinLabel}
              unit={voice.grounds.sessionMinUnit}
              value={durationMin}
              onChange={(v) => onSession({ durationMin: v })}
              placeholder="60"
              step="5"
              max={480}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-faint">{voice.grounds.sessionSizeNote}</p>
        </div>
      )}

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setWhenOpen((v) => !v)}
          aria-expanded={whenOpen}
          className="group card flex w-full items-center justify-between px-3.5 py-3 transition-colors hover:border-accent/40"
        >
          <span className="flex items-center gap-2.5 text-sm text-ink-dim">
            <CalendarIcon />
            When
          </span>
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            {whenLabel}
            <CollapseChevron expanded={whenOpen} />
          </span>
        </button>
        <Collapsible open={whenOpen} innerClassName="pt-2">
          <CalendarPicker value={performedAt} onChange={onPerformedAt} workouts={workouts} />
        </Collapsible>
      </div>

      {blockLink && <BlockLinkNote {...blockLink} />}
      <button
        type="button"
        disabled={saveBlocked !== null}
        onClick={onSave}
        className={`btn-cta w-full py-3.5 text-lg transition active:scale-[0.99] disabled:opacity-30 ${blockLink ? 'mt-2.5' : 'mt-6'}`}
      >
        {editing
          ? 'Save Changes'
          : isRun
            ? 'Save Run'
            : isSport
              ? voice.grounds.sport.save
              : 'Save Workout'}
      </button>
      {saveBlocked !== null && (
        <p className="mt-2 text-center text-xs text-ink-faint">{saveBlocked}</p>
      )}
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
