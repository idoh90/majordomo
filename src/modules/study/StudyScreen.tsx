import { useEffect, useRef, useState } from 'react'
import { useEventsStore } from '../../core/events/store'
import { useShellStore } from '../../core/store/shell'
import { Sheet } from '../../core/ui/Sheet'
import { useNow } from '../../core/useNow'
import { voice } from '../../core/voice'
import { reconcileMarkers, studyStats } from './lib'
import { useStudyStore } from './store'
import type { Subject } from './types'

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MAX_RINGS = 8
const RING_C = 2 * Math.PI * 48

const fdate = (d: Date) => `${WD[d.getDay()]} ${d.getDate()}`

/** The Study — subjects as progress rings, sessions planned then fulfilled. */
export function StudyScreen() {
  const activeEvents = useEventsStore((s) => (s.sandbox ? s.sandbox.events : s.events))
  const subjects = useStudyStore((s) => s.subjects)
  const sessions = useStudyStore((s) => s.sessions)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const [sheet, setSheet] = useState<'enrol' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const butler = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 4_500)
  }
  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  // upkeep on entry: heal markers, drop meta for events deleted Manor-side.
  // Both are sandbox-guarded (reconcileMarkers internally; prune here).
  useEffect(() => {
    const events = useEventsStore.getState()
    const study = useStudyStore.getState()
    reconcileMarkers(study.homework, study.exams, Date.now())
    if (!events.sandbox) study.pruneSessions(events.events.map((e) => e.id))
  }, [])

  const stats = studyStats(activeEvents, sessions, subjects, now, weekStart)
  const active = subjects.filter((s) => !s.archived)

  return (
    <div className="mt-4 flex flex-col gap-4">
      <RingsPanel
        subjects={active}
        stats={stats}
        onEnrol={() => setSheet('enrol')}
      />

      <EnrolSheet open={sheet === 'enrol'} onClose={() => setSheet(null)} butler={butler} />

      {toast && (
        <div className="menu-panel fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 text-[13px] animate-[fade-in_200ms_ease-out]">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- rings */

function RingsPanel({
  subjects,
  stats,
  onEnrol,
}: {
  subjects: Subject[]
  stats: ReturnType<typeof studyStats>
  onEnrol: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? subjects : subjects.slice(0, MAX_RINGS)
  const hidden = subjects.length - shown.length

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 className="card-title">{voice.study.readingWeek}</h2>
        <span className="ml-auto text-[11.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
          {voice.study.weekLine({
            from: fdate(stats.weekStart),
            to: fdate(new Date(stats.weekEnd.getTime() - 86_400_000)),
            fulfilled: stats.totalFulfilled,
            booked: stats.totalBooked,
          })}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-stretch gap-x-6 gap-y-4">
        {shown.map((s) => (
          <SubjectRing key={s.id} subject={s} week={stats.perSubject[s.id]} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-center rounded-pill border border-line px-3.5 py-1.5 font-display text-[10px] font-semibold tracking-[0.14em] text-ink-dim transition-colors hover:text-ink"
          >
            {voice.study.more(hidden)}
          </button>
        )}
        <button
          type="button"
          onClick={onEnrol}
          className="flex min-h-[150px] w-[130px] flex-col items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-line p-2.5 text-center font-display text-[10.5px] font-semibold tracking-[0.14em] text-ink-faint transition-colors hover:border-ink-faint hover:text-ink-dim"
        >
          <span className="text-[22px] font-normal leading-none">+</span>
          {voice.study.enrol}
        </button>
      </div>
    </section>
  )
}

function SubjectRing({ subject, week }: { subject: Subject; week?: { fulfilledH: number } }) {
  const fh = week?.fulfilledH ?? 0
  const goal = subject.goalH
  const frac = goal > 0 ? Math.min(1, fh / goal) : 0
  const noGoal = goal <= 0
  return (
    <div className="flex w-[130px] flex-col items-center gap-2">
      <div className="relative h-[118px] w-[118px]">
        <svg width="118" height="118" viewBox="0 0 118 118" aria-hidden>
          <circle cx="59" cy="59" r="48" fill="none" stroke="var(--color-panel-2)" strokeWidth="9" />
          <circle
            cx="59"
            cy="59"
            r="48"
            fill="none"
            stroke="var(--color-w-study)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${(noGoal ? RING_C : RING_C * frac).toFixed(1)} ${RING_C.toFixed(1)}`}
            transform="rotate(-90 59 59)"
            opacity={noGoal ? 0.25 : 1}
            style={{ filter: 'drop-shadow(0 0 6px var(--glow-study))' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="stat-num font-display text-[27px] font-semibold leading-none">
            {fh.toFixed(1)}
          </div>
          <div className="mt-0.5 text-[10.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
            {noGoal ? voice.study.ringNoGoal : voice.study.ringOfGoal(goal)}
          </div>
        </div>
      </div>
      <div className="text-center font-display text-[10.5px] font-semibold tracking-[0.14em] text-ink-dim">
        {subject.name.toUpperCase()}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- sheets */

export function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 mt-4 block font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
      {children}
    </span>
  )
}

export function Stepper({
  label,
  onDec,
  onInc,
}: {
  label: string
  onDec: () => void
  onInc: () => void
}) {
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={onDec}
        className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink"
      >
        −
      </button>
      <span className="min-w-[84px] text-center font-display text-[17px] font-semibold [font-variant-numeric:tabular-nums]">
        {label}
      </span>
      <button
        type="button"
        onClick={onInc}
        className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink"
      >
        +
      </button>
    </span>
  )
}

export function SheetActions({
  cta,
  onCancel,
  onSave,
}: {
  cta: string
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mt-5 flex justify-end gap-2.5">
      <button type="button" onClick={onCancel} className="btn-soft px-4 py-2.5 text-[11px] font-display font-bold uppercase tracking-[0.14em]">
        {voice.study.sheet.cancel}
      </button>
      <button type="button" onClick={onSave} className="btn-cta px-5 py-2.5 text-[11px] tracking-[0.16em]">
        {cta}
      </button>
    </div>
  )
}

function EnrolSheet({
  open,
  onClose,
  butler,
}: {
  open: boolean
  onClose: () => void
  butler: (msg: string) => void
}) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState(4)

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      butler(voice.study.toast.nameFirst)
      return
    }
    useStudyStore.getState().addSubject(trimmed, goal)
    butler(voice.study.toast.enrolled)
    setName('')
    setGoal(4)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.study.enrol}</h2>
      <SheetLabel>{voice.study.sheet.name}</SheetLabel>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={voice.study.sheet.namePlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <SheetLabel>{voice.study.sheet.weeklyGoal}</SheetLabel>
      <Stepper
        label={`${goal.toFixed(1)} h / wk`}
        onDec={() => setGoal((g) => Math.max(0, g - 0.5))}
        onInc={() => setGoal((g) => Math.min(30, g + 0.5))}
      />
      <div className="mt-3.5 text-xs italic text-ink-dim">{voice.study.sheet.goalZeroHint}</div>
      <SheetActions cta={voice.study.sheet.ctaEnrol} onCancel={onClose} onSave={save} />
    </Sheet>
  )
}
