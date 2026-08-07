import { useEffect, useMemo, useRef, useState } from 'react'
import { addDays, startOfWeek } from '../../core/dates'
import { useEventsStore } from '../../core/events/store'
import { useShellStore } from '../../core/store/shell'
import { PRESET_SKIN_IDS, SKINS } from '../../core/ui/skins'
import { voice } from '../../core/voice'
import { useStudyStore } from '../../modules/study/store'
import { useWorkoutStore } from '../../modules/training/store'
import { DAY_MIN, hhmmOfMin, planWatchPost } from '../../modules/watch/lib'
import { useWatchStore } from '../../modules/watch/store'
import { setupStages, useOnboarding, type OnboardStage } from './store'

/**
 * The interview — four questions that BUILD the estate rather than describe it.
 *
 * Deliberately scrim-less and deliberately small: the whole point is that the
 * Manor is visible behind it and fills in as the questions are answered. A
 * modal over a dimmed page would answer the same questions and teach nothing.
 *
 * Every write here goes through a wing's OWN store action — the same call the
 * wing's own screen makes. Nothing in this folder may become a second way to
 * write the estate.
 *
 * On mobile the panel sits over the tab bar on purpose: a stray tab tap
 * mid-interview would abandon the run with no way back to it.
 */
export function SetupPanel({ stage }: { stage: OnboardStage }) {
  const advance = useOnboarding((s) => s.advance)
  const composition = useOnboarding((s) => s.composition)
  // the "n OF m" counts only the questions THIS run holds — the measure
  // decided which those are, and a student sees "1 OF 2", not gaps
  const stages = setupStages(composition)
  const step = stages.indexOf(stage) + 1
  // a day job asks the same question in fewer words; shift work wins when
  // both were picked, being the superset
  const dayJob = composition?.dayJob === true && composition?.shift !== true

  // a refusal (or any other one-line remark) from the stage below, shown in
  // place of its running tally until it expires
  const [note, setNote] = useState<string | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remark = (msg: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current)
    setNote(msg)
    noteTimer.current = setTimeout(() => setNote(null), 4_500)
  }
  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current)
    },
    [],
  )
  // a remark belongs to the question that produced it
  useEffect(() => setNote(null), [stage])

  const copy =
    stage === 'work'
      ? voice.onboarding.work
      : stage === 'training'
        ? voice.onboarding.training
        : stage === 'study'
          ? voice.onboarding.study
          : voice.onboarding.preset

  const prompt =
    stage === 'work' && dayJob ? voice.onboarding.work.dayJobPrompt : copy.prompt

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:inset-y-6 md:left-auto md:right-6 md:flex md:w-[360px] md:items-center">
      <div className="sheet-surface flex max-h-[55dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-line shadow-[0_-12px_40px_rgb(0_0_0/0.45)] md:max-h-full md:rounded-2xl md:border md:shadow-[0_18px_50px_rgb(0_0_0/0.5)]">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-4">
          <div className="card-title">
            {voice.onboarding.chrome.step({ n: step, of: stages.length })}
          </div>
          <h2 className="mt-1.5 font-display text-lg font-bold uppercase tracking-[0.16em] text-ink">
            {copy.title}
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-dim">{prompt}</p>

          <div className="mt-4">
            {stage === 'work' && <WorkStage dayJob={dayJob} note={note} onRemark={remark} />}
            {stage === 'training' && <TrainingStage />}
            {stage === 'study' && <StudyStage note={note} onRemark={remark} />}
            {stage === 'preset' && <PresetStage />}
          </div>
        </div>

        {/* one way past a question, not two: an adjacent "Skip" and "Skip the
            rest" read as the same control twice. Skipping the WHOLE thing is
            the welcome screen's "Not now"; leaving early once the walk has
            started is the walk card's own affordance. */}
        <div className="flex items-center gap-3 border-t border-line px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={advance}
            className="min-h-11 text-[13px] text-ink-dim transition-colors hover:text-ink"
          >
            {voice.onboarding.chrome.skip}
          </button>
          <button type="button" onClick={advance} className="btn-cta ml-auto px-7 py-2.5 text-sm">
            {voice.onboarding.chrome.next}
          </button>
        </div>
      </div>
    </div>
  )
}

/** a quiet heading over a group of controls inside the panel */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ work */

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

/**
 * The one stage that writes to the calendar, and the reason the panel is
 * scrim-less: every day tapped here appears in the grid behind it immediately.
 *
 * Watches posted in THIS sitting can be taken back by tapping the day again —
 * an interview is a conversation, and a mistap should not require finding the
 * Watch afterwards. Anything already on the books is not ours to remove, so a
 * day carrying someone else's watch is simply refused by the overlap rule.
 */
function WorkStage({
  dayJob,
  note,
  onRemark,
}: {
  dayJob: boolean
  note: string | null
  onRemark: (m: string) => void
}) {
  const templates = useWatchStore((s) => s.templates)
  const events = useEventsStore((s) => s.events)
  const addEvent = useEventsStore((s) => s.addEvent)
  const deleteEvent = useEventsStore((s) => s.deleteEvent)
  const weekStart = useShellStore((s) => s.weekStart)

  // a day job leads with the nine-to-five; shift work with the first shape
  const [shapeId, setShapeId] = useState<string | null>(() => {
    if (dayJob) {
      const nine = templates.find((t) => t.startMin === 540 && t.endMin === 1020)
      if (nine) return nine.id
    }
    return templates[0]?.id ?? null
  })
  /** day index → the ids this sitting created for it, so a re-tap can undo */
  const [posted, setPosted] = useState<Record<number, string[]>>({})

  const days = useMemo(() => {
    const first = startOfWeek(new Date(), weekStart)
    return Array.from({ length: 14 }, (_, i) => addDays(first, i))
  }, [weekStart])

  const shape = templates.find((t) => t.id === shapeId) ?? null

  /** days already carrying a watch we did not post — tapping them is refused */
  const taken = useMemo(() => {
    const byDay = new Set<string>()
    for (const e of events) {
      if (e.kind !== 'shift' || e.allDay) continue
      const s = new Date(e.start)
      byDay.add(`${s.getFullYear()}-${s.getMonth()}-${s.getDate()}`)
    }
    return byDay
  }, [events])

  const toggle = (i: number) => {
    const mine = posted[i]
    if (mine) {
      for (const id of mine) deleteEvent(id)
      setPosted(({ [i]: _gone, ...rest }) => rest)
      return
    }
    if (!shape) return
    // read the store rather than the render's snapshot: several days are posted
    // in a row here, and each has to see the one before it
    const plan = planWatchPost(
      useEventsStore.getState().events,
      days[i],
      { startMin: shape.startMin, endMin: shape.endMin },
      shape.name,
    )
    if (!plan.ok) {
      onRemark(plan.message)
      return
    }
    // write BEFORE the setState, never inside its updater: StrictMode invokes
    // an updater twice to surface exactly this kind of impurity, and one tap
    // was posting the watch (and its sleep) twice
    const ids = plan.events.map((e) => addEvent(e).id)
    setPosted((p) => ({ ...p, [i]: ids }))
  }

  /** the day-job one-tap: every weekday of both weeks, each through the same
   *  rules a single tap follows — occupied days are simply passed over */
  const fillWeekdays = () => {
    if (!shape) return
    const filled: Record<number, string[]> = {}
    for (let i = 0; i < days.length; i++) {
      const d = days[i]
      if (d.getDay() === 0 || d.getDay() === 6) continue
      if (posted[i]) continue
      const plan = planWatchPost(
        useEventsStore.getState().events,
        d,
        { startMin: shape.startMin, endMin: shape.endMin },
        shape.name,
      )
      if (plan.ok) filled[i] = plan.events.map((e) => addEvent(e).id)
    }
    if (Object.keys(filled).length > 0) setPosted((p) => ({ ...p, ...filled }))
  }

  const count = Object.keys(posted).length

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => {
          const on = t.id === shapeId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setShapeId(t.id)}
              className={`card px-3 py-2 text-left text-[12px] [font-variant-numeric:tabular-nums] transition-colors ${
                on ? 'border-accent bg-accent/10 text-accent' : 'text-ink-dim hover:border-accent/40'
              }`}
            >
              <b className="font-semibold">{t.name}</b>
              <span className="ml-1.5 opacity-80">
                {hhmmOfMin(t.startMin)} → {hhmmOfMin(t.endMin)}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[12.5px] leading-snug text-ink-dim">{voice.onboarding.work.hint}</p>

      {dayJob && (
        <button
          type="button"
          onClick={fillWeekdays}
          className="btn-soft mt-3 w-full py-2.5 text-[11.5px] tracking-[0.14em]"
        >
          {voice.onboarding.work.weekdaysCta}
        </button>
      )}

      <div className="mt-4">
        <GroupLabel>{voice.onboarding.work.daysLabel}</GroupLabel>
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            const mine = posted[i] !== undefined
            const busy = !mine && taken.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
            return (
              <button
                key={i}
                type="button"
                aria-pressed={mine}
                onClick={() => toggle(i)}
                className={`flex min-h-11 flex-col items-center justify-center rounded-[9px] border py-1.5 text-[10px] leading-tight transition-colors [font-variant-numeric:tabular-nums] ${
                  mine
                    ? 'border-accent bg-accent/15 text-accent'
                    : busy
                      ? 'border-line bg-panel-2 text-ink-faint'
                      : 'border-line text-ink-dim hover:border-accent/40 hover:text-ink'
                }`}
              >
                <span className="tracking-[0.08em]">{WD[d.getDay()]}</span>
                <span className="mt-0.5 text-[12px] font-semibold">{d.getDate()}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="mt-3 text-[12.5px] text-ink-dim">
        {note ?? voice.onboarding.work.posted(count)}
      </p>
      {shape && shape.endMin > DAY_MIN && (
        <p className="mt-1 text-[12px] italic text-ink-faint">
          {voice.onboarding.work.nightNote}
        </p>
      )}
    </>
  )
}

/* -------------------------------------------------------------- training */

/** the stepper's ceiling here — the Grounds allows more, but a first-run
 *  question offering fourteen sessions a week is not asking in good faith */
const SETUP_GOAL_MAX = 7

/**
 * The weekly goal, and — folded away — the measurements the fuel arithmetic has
 * been quietly assuming. Making the borrowed 82 kg / 30 y build visible is the
 * point of the fold: a number the user never saw cannot be a number they chose.
 */
function TrainingStage() {
  const goal = useWorkoutStore((s) => s.weeklyGoal)
  const setWeeklyGoal = useWorkoutStore((s) => s.setWeeklyGoal)
  const profile = useWorkoutStore((s) => s.profile)
  const setProfile = useWorkoutStore((s) => s.setProfile)
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-4">
        <StepButton
          label="−"
          disabled={goal <= 0}
          onClick={() => setWeeklyGoal(Math.max(0, goal - 1))}
        />
        <div className="min-w-16 text-center">
          <div className="stat-num font-display text-[38px] leading-none text-ink">{goal}</div>
          <div className="mt-0.5 text-[11px] text-ink-dim">
            {goal === 0 ? voice.grounds.goalNone : voice.grounds.goalPerWeek}
          </div>
        </div>
        <StepButton
          label="+"
          disabled={goal >= SETUP_GOAL_MAX}
          onClick={() => setWeeklyGoal(Math.min(SETUP_GOAL_MAX, goal + 1))}
        />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-5 flex w-full items-center gap-2 text-left"
      >
        <GroupLabel>{voice.onboarding.training.profileLabel}</GroupLabel>
        <span className="mb-1.5 ml-auto text-[11px] text-accent">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="animate-[fade-in_160ms_ease-out]">
          <p className="mb-3 text-[12px] leading-snug text-ink-dim">
            {voice.onboarding.training.profileHint}
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <NumField
              label={voice.onboarding.training.weightLabel}
              unit={voice.onboarding.training.weightUnit}
              value={profile.weightKg}
              step={0.5}
              onChange={(v) => setProfile({ weightKg: v })}
            />
            <NumField
              label={voice.onboarding.training.heightLabel}
              unit={voice.onboarding.training.heightUnit}
              value={profile.heightCm}
              onChange={(v) => setProfile({ heightCm: v })}
            />
            <NumField
              label={voice.onboarding.training.ageLabel}
              unit={voice.onboarding.training.ageUnit}
              value={profile.age}
              onChange={(v) => setProfile({ age: v })}
            />
            <div>
              <GroupLabel>{voice.onboarding.training.sexLabel}</GroupLabel>
              <div className="flex gap-1.5">
                {(
                  [
                    ['male', voice.onboarding.training.sexMale],
                    ['female', voice.onboarding.training.sexFemale],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setProfile({ sex: value })}
                    className={`card flex-1 py-2 text-[12.5px] transition-colors ${
                      profile.sex === value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'text-ink-dim hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function StepButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="chip flex h-11 w-11 items-center justify-center border border-line bg-panel text-lg text-ink transition-colors hover:border-accent/50 disabled:opacity-30"
    >
      {label}
    </button>
  )
}

/** a number field that only writes a value it can actually make sense of —
 *  a half-typed "1" must not become a bodyweight */
function NumField({
  label,
  unit,
  value,
  step,
  onChange,
}: {
  label: string
  unit: string
  value: number
  step?: number
  onChange: (v: number) => void
}) {
  const [text, setText] = useState(String(value))
  return (
    <div>
      <GroupLabel>
        {label} <span className="normal-case tracking-normal opacity-70">{unit}</span>
      </GroupLabel>
      <input
        type="number"
        inputMode="decimal"
        step={step ?? 1}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n > 0) onChange(n)
        }}
        onBlur={() => setText(String(value))}
        className="card w-full px-3 py-2 text-sm text-ink outline-none [font-variant-numeric:tabular-nums] focus:border-accent/60"
      />
    </div>
  )
}

/* ----------------------------------------------------------------- study */

/** the fastest stage to skip, and it says so rather than pressing */
function StudyStage({ note, onRemark }: { note: string | null; onRemark: (m: string) => void }) {
  const subjects = useStudyStore((s) => s.subjects)
  const addSubject = useStudyStore((s) => s.addSubject)
  const [name, setName] = useState('')
  const [goalH, setGoalH] = useState('4')
  const [enrolled, setEnrolled] = useState<string[]>([])

  const enrol = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      onRemark(voice.study.toast.nameFirst)
      return
    }
    // re-running the setup must not enrol the same subject twice
    const already = useStudyStore
      .getState()
      .subjects.some((s) => s.name.trim().toLowerCase() === trimmed.toLowerCase())
    if (already) {
      onRemark(voice.onboarding.study.duplicate)
      setName('')
      return
    }
    const hours = Number(goalH)
    addSubject(trimmed, Number.isFinite(hours) && hours > 0 ? hours : 0)
    setEnrolled((e) => [...e, trimmed])
    setName('')
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              enrol()
            }
          }}
          placeholder={voice.study.sheet.namePlaceholder}
          className="card min-w-0 flex-1 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
        />
        <div className="w-20 flex-none">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={goalH}
            onChange={(e) => setGoalH(e.target.value)}
            className="card w-full px-3 py-2.5 text-sm text-ink outline-none [font-variant-numeric:tabular-nums] focus:border-accent/60"
          />
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
          {voice.onboarding.study.goalLabel}
        </span>
        <button
          type="button"
          onClick={enrol}
          className="btn-soft px-4 py-2 text-[11.5px] tracking-[0.14em]"
        >
          {voice.onboarding.study.add}
        </button>
      </div>

      {enrolled.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {enrolled.map((n) => (
            <span
              key={n}
              className="chip border border-accent/40 px-2.5 py-1 text-[12px] text-accent"
            >
              {n}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-[12.5px] text-ink-dim">
        {note ??
          (subjects.length > 0
            ? voice.onboarding.study.enrolled(subjects.length)
            : voice.onboarding.study.none)}
      </p>
    </>
  )
}

/* ---------------------------------------------------------------- preset */

/** applied on tap, exactly like the skin picker — a livery you cannot see is
 *  not a choice you can make */
function PresetStage() {
  const skin = useShellStore((s) => s.skin)
  const setSkin = useShellStore((s) => s.setSkin)

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={voice.onboarding.preset.title}>
      {PRESET_SKIN_IDS.map((id) => {
        const s = SKINS[id]
        const active = id === skin
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSkin(id)}
            className={`card flex items-center gap-3 p-2.5 text-left transition-colors ${
              active ? 'border-accent bg-accent/10' : 'hover:border-accent/40'
            }`}
          >
            <span
              className="flex h-8 w-12 shrink-0 overflow-hidden rounded-md border border-line"
              aria-hidden
            >
              {s.swatches.map((c, i) => (
                <span key={i} className="h-full flex-1" style={{ background: c }} />
              ))}
            </span>
            <span className="min-w-0">
              <span
                className={`block font-display text-[13px] font-bold uppercase tracking-[0.1em] ${
                  active ? 'text-accent' : 'text-ink'
                }`}
              >
                {s.name}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] text-ink-dim">{s.tagline}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
