import { useEffect, useRef, useState } from 'react'
import { addDays, atHour, localDayKey, startOfWeek } from '../../core/dates'
import { hoursOf, rangeFree } from '../../core/events/lib'
import { useEventsStore } from '../../core/events/store'
import { StudyBriefing } from './Briefing'
import type { CalendarEvent } from '../../core/events/types'
import { useShellStore } from '../../core/store/shell'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { Sheet } from '../../core/ui/Sheet'
import { useNow } from '../../core/useNow'
import { voice } from '../../core/voice'
import {
  awaitingReport,
  dayKeyToDate,
  daysUntil,
  examProgress,
  metaOf,
  reconcileMarkers,
  studyStats,
  subjRef,
  subjectOfEvent,
} from './lib'
import { useStudyStore } from './store'
import { useStudyUi } from './uiStore'
import type { Exam, SessionMeta, Subject } from './types'

const WD = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MAX_RINGS = 8
const RING_C = 2 * Math.PI * 48

const fdate = (d: Date) => `${WD[d.getDay()]} ${d.getDate()}`
const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** The Study — subjects as progress rings, sessions planned then fulfilled. */
export function StudyScreen() {
  const activeEvents = useEventsStore((s) => (s.sandbox ? s.sandbox.events : s.events))
  const subjects = useStudyStore((s) => s.subjects)
  const sessions = useStudyStore((s) => s.sessions)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const [sheet, setSheet] = useState<'book' | 'enrol' | 'hw' | 'exam' | 'topic' | null>(null)
  const [selSubjId, setSelSubjId] = useState<string | null>(null)
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

  // the tab bar's + posts a one-shot request through the mailbox
  const addSheetRequested = useStudyUi((s) => s.addSheetRequested)
  useEffect(() => {
    if (!addSheetRequested) return
    setSheet('book')
    useStudyUi.getState().clearAddSheetRequest()
  }, [addSheetRequested])

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
  const sel = active.find((s) => s.id === selSubjId) ?? active[0] ?? null

  return (
    <div className="mt-4 flex flex-col gap-4">
      {active.length > 0 && <StudyBriefing />}

      <RingsPanel subjects={active} stats={stats} onEnrol={() => setSheet('enrol')} />

      <ExamsPanel events={activeEvents} sessions={sessions} subjects={subjects} now={now} />

      <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr]">
        <Desk
          events={activeEvents}
          subjects={active}
          sessions={sessions}
          weekWindow={[stats.weekStart, stats.weekEnd]}
          now={now}
          onBook={() => setSheet('book')}
          butler={butler}
        />
        {sel && (
          <Dossier
            subjects={active}
            sel={sel}
            now={now}
            onPick={setSelSubjId}
            onAddHw={() => setSheet('hw')}
            onAddExam={() => setSheet('exam')}
            onAddTopic={() => setSheet('topic')}
            butler={butler}
          />
        )}
      </div>

      <BookSheet
        open={sheet === 'book'}
        onClose={() => setSheet(null)}
        subjects={active}
        events={activeEvents}
        now={now}
        butler={butler}
      />
      <EnrolSheet open={sheet === 'enrol'} onClose={() => setSheet(null)} butler={butler} />
      {sel && (
        <>
          <HwSheet
            open={sheet === 'hw'}
            onClose={() => setSheet(null)}
            subjects={active}
            defaultSubj={sel.id}
            now={now}
            butler={butler}
          />
          <ExamSheet
            open={sheet === 'exam'}
            onClose={() => setSheet(null)}
            subjects={active}
            defaultSubj={sel.id}
            now={now}
            butler={butler}
          />
          <TopicSheet open={sheet === 'topic'} onClose={() => setSheet(null)} sel={sel} butler={butler} />
        </>
      )}

      {toast && (
        <div className="menu-panel fixed bottom-[calc(84px+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 text-[13px] animate-[fade-in_200ms_ease-out] md:bottom-6">
          {toast}
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- exams */

function ExamsPanel({
  events,
  sessions,
  subjects,
  now,
}: {
  events: CalendarEvent[]
  sessions: Record<string, SessionMeta>
  subjects: Subject[]
  now: number
}) {
  const exams = useStudyStore((s) => s.exams)
  const todayKey = localDayKey(new Date(now))
  const upcoming = [...exams]
    .filter((x) => x.on >= todayKey)
    .sort((a, b) => a.on.localeCompare(b.on))
  const nameOf = (x: Exam) => subjects.find((s) => s.id === x.subjectId)?.name ?? '—'

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <h2 className="card-title">{voice.study.mattersPending}</h2>
      {upcoming.length === 0 ? (
        <div className="mt-2 text-[13px] italic text-ink-dim">{voice.study.noExams}</div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-3.5">
          {upcoming.map((x, i) => (
            <div key={x.id} className="min-w-[230px] flex-1 rounded-xl border border-line bg-panel-2 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-w-study)' }} />
                <span className="font-display text-[13.5px] font-bold tracking-[0.1em]">
                  {nameOf(x).toUpperCase()}
                </span>
                <span className="text-[10px] tracking-[0.12em] text-ink-faint">
                  {x.title.toUpperCase()}
                </span>
              </div>
              <div
                className="stat-num mt-2 font-display text-[28px] font-semibold leading-none"
                style={{ color: i === 0 ? 'var(--color-accent)' : 'var(--color-ink)' }}
              >
                {voice.study.countdown(daysUntil(x.on, now))}
              </div>
              <div className="mt-1.5 text-xs text-ink-dim [font-variant-numeric:tabular-nums]">
                {voice.study.hoursToward(examProgress(x, events, sessions))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- dossier */

function Dossier({
  subjects,
  sel,
  now,
  onPick,
  onAddHw,
  onAddExam,
  onAddTopic,
  butler,
}: {
  subjects: Subject[]
  sel: Subject
  now: number
  onPick: (id: string) => void
  onAddHw: () => void
  onAddExam: () => void
  onAddTopic: () => void
  butler: (msg: string) => void
}) {
  const homework = useStudyStore((s) => s.homework)
  const topics = useStudyStore((s) => s.topics)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const todayKey = localDayKey(new Date(now))
  const tomorrowKey = localDayKey(addDays(new Date(now), 1))

  const dueInfo = (due: string | undefined, done: boolean): [string, string] => {
    if (done) return [voice.study.due.done, 'var(--color-ink-faint)']
    if (!due) return ['', 'var(--color-ink-dim)']
    if (due < todayKey) return [voice.study.due.overdue, 'var(--color-danger)']
    if (due === todayKey) return [voice.study.due.today, 'var(--color-ember)']
    if (due === tomorrowKey) return [voice.study.due.tomorrow, 'var(--color-ink-dim)']
    return [voice.study.due.on(fdate(dayKeyToDate(due))), 'var(--color-ink-dim)']
  }

  const hwRows = [...homework].sort(
    (a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
  )
  const selTopics = topics.filter((t) => t.subjectId === sel.id).sort((a, b) => a.order - b.order)
  const covered = selTopics.filter((t) => t.covered).length
  const pct = selTopics.length ? Math.round((covered / selTopics.length) * 100) : 0
  const nameOf = (subjectId: string) => subjects.find((s) => s.id === subjectId)?.name ?? '—'

  return (
    <section className="panel p-5">
      <h2 className="card-title">{voice.study.dossier}</h2>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {subjects.map((s) => {
          const on = s.id === sel.id
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onPick(s.id)}
              className="rounded-pill border px-3.5 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors hover:border-[var(--color-w-study)]"
              style={{
                borderColor: on ? 'var(--color-w-study)' : 'var(--color-line)',
                background: on
                  ? 'color-mix(in srgb, var(--color-w-study) 14%, transparent)'
                  : 'var(--color-panel-2)',
                color: on ? 'var(--color-ink)' : 'var(--color-ink-dim)',
              }}
            >
              {s.name.toUpperCase()}
            </button>
          )
        })}
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-line bg-panel-2 px-3.5 py-2.5">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-dim">
          {voice.study.weeklyGoal}
        </span>
        <span className="ml-auto">
          <Stepper
            label={`${sel.goalH.toFixed(1)} h / wk`}
            minWidth={74}
            onDec={() =>
              useStudyStore.getState().updateSubject(sel.id, { goalH: Math.max(0, sel.goalH - 0.5) })
            }
            onInc={() =>
              useStudyStore.getState().updateSubject(sel.id, { goalH: sel.goalH + 0.5 })
            }
          />
        </span>
      </div>

      <div className="mt-5 flex items-baseline gap-2.5">
        <div className="card-title">{voice.study.homework}</div>
        <button
          type="button"
          onClick={onAddHw}
          className="ml-auto font-display text-[10px] font-semibold tracking-[0.14em] text-accent hover:underline"
        >
          {voice.study.add}
        </button>
      </div>
      <div className="mt-1 flex flex-col">
        {hwRows.map((h) => {
          const [dueL, dueC] = dueInfo(h.due, h.done)
          return (
            <div key={h.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-b-0">
              <button
                type="button"
                aria-label="Toggle done"
                onClick={() => {
                  useStudyStore.getState().setHomeworkDone(h.id, !h.done)
                  butler(h.done ? voice.study.toast.hwUndone : voice.study.toast.hwDone)
                }}
                className="flex h-5 w-5 flex-none items-center justify-center rounded-md border text-xs leading-none"
                style={{
                  background: h.done ? 'var(--color-w-study)' : 'var(--color-panel-2)',
                  borderColor: h.done ? 'var(--color-w-study)' : 'var(--color-line)',
                  color: 'var(--color-bg)',
                }}
              >
                {h.done ? '✓' : ''}
              </button>
              <span
                className="min-w-0 flex-1 text-[13px]"
                style={{
                  color: h.done ? 'var(--color-ink-faint)' : 'var(--color-ink)',
                  textDecoration: h.done ? 'line-through' : 'none',
                }}
              >
                {h.title}
                <span className="ml-1.5 font-display text-[9px] font-semibold tracking-[0.13em] text-ink-faint">
                  {nameOf(h.subjectId).toUpperCase()}
                </span>
              </span>
              <span className="flex-none text-[11px] [font-variant-numeric:tabular-nums]" style={{ color: dueC }}>
                {dueL}
              </span>
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-2.5">
        <div className="card-title">{voice.study.syllabus(sel.name.toUpperCase())}</div>
        <span className="ml-auto text-[11px] text-ink-dim [font-variant-numeric:tabular-nums]">
          {voice.study.syllabusPct({ covered, total: selTopics.length, pct })}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: 'var(--color-w-study)' }}
        />
      </div>
      <div className="mt-1 flex flex-col">
        {selTopics.map((t) => (
          <div key={t.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-b-0">
            <button
              type="button"
              aria-label="Toggle covered"
              onClick={() => useStudyStore.getState().toggleTopic(t.id)}
              className="flex h-5 w-5 flex-none items-center justify-center rounded-md border text-xs leading-none"
              style={{
                background: t.covered ? 'var(--color-w-study)' : 'var(--color-panel-2)',
                borderColor: t.covered ? 'var(--color-w-study)' : 'var(--color-line)',
                color: 'var(--color-bg)',
              }}
            >
              {t.covered ? '✓' : ''}
            </button>
            <span
              className="text-[13px]"
              style={{ color: t.covered ? 'var(--color-ink-faint)' : 'var(--color-ink)' }}
            >
              {t.title}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAddTopic} className="btn-soft px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.14em]">
          {voice.study.addTopic}
        </button>
        <button type="button" onClick={onAddExam} className="btn-soft px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.14em]">
          {voice.study.addExam}
        </button>
        <button
          type="button"
          onClick={() => setConfirmArchive(true)}
          className="ml-auto font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint transition-colors hover:text-danger"
        >
          {voice.study.archive}
        </button>
      </div>

      <ConfirmDialog
        open={confirmArchive}
        title={voice.study.archiveTitle}
        message={voice.study.archiveBody(sel.name)}
        confirmLabel={voice.study.archiveYes}
        onConfirm={() => {
          useStudyStore.getState().archiveSubject(sel.id)
          setConfirmArchive(false)
          butler(voice.study.toast.archived)
        }}
        onCancel={() => setConfirmArchive(false)}
      />
    </section>
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

/* ---------------------------------------------------------------- the desk */

function Desk({
  events,
  subjects,
  sessions,
  weekWindow,
  now,
  onBook,
  butler,
}: {
  events: CalendarEvent[]
  subjects: Subject[]
  sessions: Record<string, SessionMeta>
  weekWindow: [Date, Date]
  now: number
  onBook: () => void
  butler: (msg: string) => void
}) {
  const [partialFor, setPartialFor] = useState<string | null>(null)
  const [partialH, setPartialH] = useState(1)

  const nameOf = (e: CalendarEvent) => {
    const id = subjectOfEvent(e)
    return id ? (subjects.find((s) => s.id === id)?.name ?? e.title) : e.title
  }

  const awaiting = awaitingReport(events, sessions, now)
  const fulfill = (id: string, f: SessionMeta['fulfillment'], doneH?: number) => {
    useStudyStore.getState().fulfill(id, f, doneH)
    setPartialFor(null)
    butler(
      f === 'done'
        ? voice.study.toast.markedDone
        : f === 'skipped'
          ? voice.study.toast.struck
          : voice.study.toast.notedPartial(doneH ?? 0),
    )
  }
  const file = (e: CalendarEvent, subjectId: string) => {
    useEventsStore.getState().updateEvent(e.id, { sourceRef: subjRef(subjectId) })
    useStudyStore.getState().setSessionMeta(e.id, { fulfillment: 'planned' })
    butler(voice.study.toast.filed)
  }

  const [w0, w1] = weekWindow
  const ledger = events
    .filter((e) => {
      if (e.kind !== 'study' || e.allDay) return false
      const s = new Date(e.start)
      return s >= w0 && s < w1
    })
    .sort((a, b) => a.start.localeCompare(b.start))

  return (
    <div className="flex flex-col gap-4">
      <section className="panel p-5">
        <h2 className="card-title">{voice.study.desk}</h2>
        <button type="button" onClick={onBook} className="btn-cta mt-3 w-full py-3 text-[13px] tracking-[0.16em]">
          {voice.study.book}
        </button>

        <div className="card-title mt-5">{voice.study.awaiting}</div>
        {awaiting.length === 0 && (
          <div className="py-2.5 text-[13px] italic text-ink-dim">{voice.study.noAwaiting}</div>
        )}
        {awaiting.map((e) => {
          const s = new Date(e.start)
          const en = new Date(e.end)
          const unfiled = subjectOfEvent(e) === null
          const open = partialFor === e.id
          const maxP = Math.max(0.5, hoursOf(e) - 0.5)
          return (
            <div key={e.id} className="border-b border-line py-2.5 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <span className="text-[13px] font-semibold">{nameOf(e)}</span>
                <span className="text-xs text-ink-dim [font-variant-numeric:tabular-nums]">
                  {fdate(s)} · {hhmm(s)} → {hhmm(en)}
                </span>
                <span className="ml-auto font-display text-sm font-semibold [font-variant-numeric:tabular-nums]">
                  {hoursOf(e).toFixed(1)} h
                </span>
              </div>
              {unfiled ? (
                <div className="mt-2">
                  <span className="font-display text-[9px] font-semibold tracking-[0.16em] text-ink-faint">
                    {voice.study.fileUnder}
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {subjects.map((subj) => (
                      <button
                        key={subj.id}
                        type="button"
                        onClick={() => file(e, subj.id)}
                        className="rounded-pill border border-line bg-panel-2 px-3 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-dim transition-colors hover:border-[var(--color-w-study)] hover:text-ink"
                      >
                        {subj.name.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <QueueAction
                      label={voice.study.done}
                      color="var(--color-positive)"
                      onClick={() => fulfill(e.id, 'done')}
                    />
                    <QueueAction
                      label={voice.study.partial}
                      color="var(--color-ember)"
                      onClick={() => {
                        setPartialFor(open ? null : e.id)
                        setPartialH(maxP)
                      }}
                    />
                    <QueueAction
                      label={voice.study.skipped}
                      color="var(--color-ink-faint)"
                      onClick={() => fulfill(e.id, 'skipped')}
                    />
                  </div>
                  {open && (
                    <div className="mt-2.5 flex items-center gap-2.5 animate-[fade-in_160ms_ease-out]">
                      <button type="button" onClick={() => setPartialH((h) => Math.max(0.5, h - 0.5))} className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink">−</button>
                      <span className="min-w-[44px] text-center font-display text-base font-semibold [font-variant-numeric:tabular-nums]">
                        {partialH.toFixed(1)} h
                      </span>
                      <button type="button" onClick={() => setPartialH((h) => Math.min(maxP, h + 0.5))} className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line bg-panel-2 text-base text-ink">+</button>
                      <button
                        type="button"
                        onClick={() => fulfill(e.id, 'partial', partialH)}
                        className="btn-cta px-4 py-2 text-[11px] tracking-[0.14em]"
                      >
                        {voice.study.logIt}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
        {awaiting.filter((e) => subjectOfEvent(e) !== null).length > 1 && (
          <button
            type="button"
            onClick={() => {
              for (const e of awaiting) {
                if (subjectOfEvent(e) !== null) useStudyStore.getState().fulfill(e.id, 'skipped')
              }
              setPartialFor(null)
              butler(voice.study.toast.restStruck)
            }}
            className="mt-2.5 font-display text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {voice.study.strikeRest}
          </button>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="card-title">{voice.study.weekLedger}</h2>
        <div className="mt-1.5 flex flex-col">
          {ledger.length === 0 && (
            <div className="py-2 text-[13px] text-ink-dim">{voice.study.noLedger}</div>
          )}
          {ledger.map((e) => {
            const s = new Date(e.start)
            const en = new Date(e.end)
            const meta = metaOf(sessions, e)
            const past = en.getTime() <= now
            const [st, stColor] =
              meta.fulfillment === 'done'
                ? [voice.study.status.done, 'var(--color-positive)']
                : meta.fulfillment === 'partial'
                  ? [voice.study.status.partial(meta.doneH ?? 0), 'var(--color-ember)']
                  : meta.fulfillment === 'skipped'
                    ? [voice.study.status.skipped, 'var(--color-ink-faint)']
                    : past
                      ? [voice.study.status.awaiting, 'var(--color-accent)']
                      : [voice.study.status.ahead, 'var(--color-ink-dim)']
            return (
              <div key={e.id} className="flex flex-wrap items-baseline gap-2.5 border-b border-line py-2 last:border-b-0">
                <span className="w-[52px] text-[12.5px] font-semibold [font-variant-numeric:tabular-nums]">
                  {fdate(s)}
                </span>
                <span className="text-[12.5px] text-ink-dim [font-variant-numeric:tabular-nums]">
                  {hhmm(s)} → {hhmm(en)}
                </span>
                <span className="text-[12.5px]">{nameOf(e)}</span>
                <span className="ml-auto font-display text-sm font-semibold [font-variant-numeric:tabular-nums]">
                  {hoursOf(e).toFixed(1)} h
                </span>
                <span className="w-[88px] text-right font-display text-[9.5px] font-semibold tracking-[0.13em]" style={{ color: stColor }}>
                  {st}
                </span>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

function QueueAction({
  label,
  color,
  onClick,
}: {
  label: string
  color: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill border bg-transparent px-3.5 py-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.14em] transition-[filter] hover:brightness-125"
      style={{ borderColor: color, color }}
    >
      {label}
    </button>
  )
}

/* ---------------------------------------------------------------- sheets */

function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 mt-4 block font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
      {children}
    </span>
  )
}

function Stepper({
  label,
  minWidth = 84,
  onDec,
  onInc,
}: {
  label: string
  minWidth?: number
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
      <span
        className="text-center font-display text-[17px] font-semibold [font-variant-numeric:tabular-nums]"
        style={{ minWidth }}
      >
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

function SheetActions({
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
      <button
        type="button"
        onClick={onCancel}
        className="btn-soft px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-[0.14em]"
      >
        {voice.study.sheet.cancel}
      </button>
      <button type="button" onClick={onSave} className="btn-cta px-5 py-2.5 text-[11px] tracking-[0.16em]">
        {cta}
      </button>
    </div>
  )
}

/** subject picker chips shared by the sheets */
function SubjectChips({
  subjects,
  value,
  onPick,
}: {
  subjects: Subject[]
  value: string
  onPick: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {subjects.map((s) => {
        const on = s.id === value
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="rounded-pill border px-3.5 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.1em] transition-colors"
            style={{
              borderColor: on ? 'var(--color-accent)' : 'var(--color-line)',
              background: on
                ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                : 'var(--color-panel-2)',
              color: on ? 'var(--color-ink)' : 'var(--color-ink-dim)',
            }}
          >
            {s.name.toUpperCase()}
          </button>
        )
      })}
    </div>
  )
}

/** 14-day strip (this week + next), shared by book/homework sheets */
function DayStrip({
  now,
  picked,
  onPick,
}: {
  now: number
  picked: number | null
  onPick: (i: number) => void
}) {
  const strip0 = startOfWeek(new Date(now), useShellStore.getState().weekStart)
  const days = Array.from({ length: 14 }, (_, i) => addDays(strip0, i))
  const todayKey = localDayKey(new Date(now))
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((day, i) => {
        const on = picked === i
        const isToday = localDayKey(day) === todayKey
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            className="w-[52px] rounded-[9px] border pb-1.5 pt-2 text-center transition-colors hover:border-accent"
            style={{
              borderColor: on ? 'var(--color-accent)' : 'var(--color-line)',
              background: on
                ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                : 'var(--color-panel-2)',
            }}
          >
            <span
              className="block text-[9px] tracking-[0.16em]"
              style={{ color: isToday ? 'var(--color-accent)' : 'var(--color-ink-dim)' }}
            >
              {WD[day.getDay()]}
            </span>
            <span className="block font-display text-base font-semibold [font-variant-numeric:tabular-nums]">
              {day.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** index of today inside the 14-day strip */
function todayStripIndex(now: number): number {
  const strip0 = startOfWeek(new Date(now), useShellStore.getState().weekStart)
  return Math.max(0, Math.min(13, Math.round((new Date(now).setHours(0, 0, 0, 0) - strip0.getTime()) / 86_400_000)))
}

function BookSheet({
  open,
  onClose,
  subjects,
  events,
  now,
  butler,
}: {
  open: boolean
  onClose: () => void
  subjects: Subject[]
  events: CalendarEvent[]
  now: number
  butler: (msg: string) => void
}) {
  const homework = useStudyStore((s) => s.homework)
  const [subj, setSubj] = useState<string>('')
  const [dayIdx, setDayIdx] = useState<number | null>(null)
  const [startH, setStartH] = useState(19)
  const [dur, setDur] = useState(1.5)
  const [hw, setHw] = useState('')
  const [note, setNote] = useState('')

  // (re)seed on open so the sheet always starts on today + the first subject
  useEffect(() => {
    if (!open) return
    setSubj((prev) => (subjects.some((s) => s.id === prev) ? prev : (subjects[0]?.id ?? '')))
    setDayIdx(todayStripIndex(now))
    setStartH(19)
    setDur(1.5)
    setHw('')
    setNote('')
  }, [open])

  const strip0 = startOfWeek(new Date(now), useShellStore.getState().weekStart)
  const day = addDays(strip0, dayIdx ?? 0)
  const start = atHour(day, startH)
  const end = atHour(day, startH + dur)
  const past = end.getTime() <= now

  const save = () => {
    const subject = subjects.find((s) => s.id === subj)
    if (!subject || dayIdx === null) return
    if (!rangeFree(events, start, end)) {
      butler(voice.manor.occupied)
      return
    }
    const ev = useEventsStore.getState().addEvent({
      source: 'study',
      sourceRef: subjRef(subject.id),
      kind: 'study',
      title: subject.name,
      start: start.toISOString(),
      end: end.toISOString(),
      notes: note.trim() || undefined,
    })
    useStudyStore.getState().setSessionMeta(ev.id, {
      fulfillment: past ? 'done' : 'planned',
      ...(hw ? { homeworkId: hw } : {}),
    })
    butler(past ? voice.study.toast.logged : voice.study.toast.onBooks)
    onClose()
  }

  const hwOptions = homework.filter((h) => !h.done && h.subjectId === subj)

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.study.book}</h2>
      <SheetLabel>{voice.study.sheet.subject}</SheetLabel>
      <SubjectChips subjects={subjects} value={subj} onPick={(id) => { setSubj(id); setHw('') }} />
      <SheetLabel>{voice.study.sheet.day}</SheetLabel>
      <DayStrip now={now} picked={dayIdx} onPick={setDayIdx} />
      <div className="flex flex-wrap gap-x-6 gap-y-0">
        <div>
          <SheetLabel>{voice.study.sheet.start}</SheetLabel>
          <select
            value={startH}
            onChange={(e) => setStartH(Number(e.target.value))}
            className="rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink"
          >
            {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
        <div>
          <SheetLabel>{voice.study.sheet.duration}</SheetLabel>
          <Stepper
            label={`${dur.toFixed(1)} h`}
            minWidth={52}
            onDec={() => setDur((d) => Math.max(0.5, d - 0.5))}
            onInc={() => setDur((d) => Math.min(8, d + 0.5))}
          />
        </div>
      </div>
      {hwOptions.length > 0 && (
        <>
          <SheetLabel>{voice.study.sheet.linkHomework}</SheetLabel>
          <select
            value={hw}
            onChange={(e) => setHw(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink"
          >
            <option value="">{voice.study.sheet.noHomework}</option>
            {hwOptions.map((h) => (
              <option key={h.id} value={h.id}>
                {h.title}
              </option>
            ))}
          </select>
        </>
      )}
      <SheetLabel>{voice.study.sheet.note}</SheetLabel>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={voice.study.sheet.notePlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <div className="mt-3.5 text-xs italic text-ink-dim">
        {past ? voice.study.sheet.bookHintPast : voice.study.sheet.bookHintFuture}
      </div>
      <SheetActions
        cta={past ? voice.study.sheet.ctaLog : voice.study.sheet.ctaBook}
        onCancel={onClose}
        onSave={save}
      />
    </Sheet>
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

function HwSheet({
  open,
  onClose,
  subjects,
  defaultSubj,
  now,
  butler,
}: {
  open: boolean
  onClose: () => void
  subjects: Subject[]
  defaultSubj: string
  now: number
  butler: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [subj, setSubj] = useState(defaultSubj)
  const [dueIdx, setDueIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setSubj(defaultSubj)
    setDueIdx(null)
  }, [open, defaultSubj])

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      butler(voice.study.toast.titleFirst)
      return
    }
    const strip0 = startOfWeek(new Date(now), useShellStore.getState().weekStart)
    const due = dueIdx === null ? undefined : localDayKey(addDays(strip0, dueIdx))
    useStudyStore.getState().addHomework(subj, trimmed, due)
    butler(voice.study.toast.hwAdded(due !== undefined))
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.study.sheet.addHomework}</h2>
      <SheetLabel>{voice.study.sheet.title}</SheetLabel>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={voice.study.sheet.hwPlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <SheetLabel>{voice.study.sheet.subject}</SheetLabel>
      <SubjectChips subjects={subjects} value={subj} onPick={setSubj} />
      <SheetLabel>{voice.study.sheet.due}</SheetLabel>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setDueIdx(null)}
          className="rounded-[9px] border px-3 py-2 font-display text-[10px] font-semibold tracking-[0.14em] text-ink-dim transition-colors"
          style={{
            borderColor: dueIdx === null ? 'var(--color-accent)' : 'var(--color-line)',
            background:
              dueIdx === null
                ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                : 'var(--color-panel-2)',
          }}
        >
          {voice.study.sheet.noDate}
        </button>
      </div>
      <div className="mt-1.5">
        <DayStrip now={now} picked={dueIdx} onPick={setDueIdx} />
      </div>
      <div className="mt-3.5 text-xs italic text-ink-dim">{voice.study.sheet.hwDueHint}</div>
      <SheetActions cta={voice.study.sheet.ctaHw} onCancel={onClose} onSave={save} />
    </Sheet>
  )
}

function ExamSheet({
  open,
  onClose,
  subjects,
  defaultSubj,
  now,
  butler,
}: {
  open: boolean
  onClose: () => void
  subjects: Subject[]
  defaultSubj: string
  now: number
  butler: (msg: string) => void
}) {
  const [title, setTitle] = useState('')
  const [subj, setSubj] = useState(defaultSubj)
  const [onDays, setOnDays] = useState(7)

  useEffect(() => {
    if (!open) return
    setTitle('')
    setSubj(defaultSubj)
    setOnDays(7)
  }, [open, defaultSubj])

  const day = addDays(new Date(now), onDays)

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      butler(voice.study.toast.titleFirst)
      return
    }
    useStudyStore.getState().addExam(subj, trimmed, localDayKey(day))
    butler(voice.study.toast.examNoted)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.study.sheet.addExam}</h2>
      <SheetLabel>{voice.study.sheet.title}</SheetLabel>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={voice.study.sheet.examPlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <SheetLabel>{voice.study.sheet.subject}</SheetLabel>
      <SubjectChips subjects={subjects} value={subj} onPick={setSubj} />
      <SheetLabel>{voice.study.sheet.theDay}</SheetLabel>
      <Stepper
        label={`${voice.study.countdown(onDays)} — ${fdate(day)}`}
        minWidth={170}
        onDec={() => setOnDays((d) => Math.max(1, d - 1))}
        onInc={() => setOnDays((d) => Math.min(90, d + 1))}
      />
      <div className="mt-3.5 text-xs italic text-ink-dim">{voice.study.sheet.examHint}</div>
      <SheetActions cta={voice.study.sheet.ctaExam} onCancel={onClose} onSave={save} />
    </Sheet>
  )
}

function TopicSheet({
  open,
  onClose,
  sel,
  butler,
}: {
  open: boolean
  onClose: () => void
  sel: Subject
  butler: (msg: string) => void
}) {
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (open) setTitle('')
  }, [open])

  const save = () => {
    const trimmed = title.trim()
    if (!trimmed) {
      butler(voice.study.toast.titleFirst)
      return
    }
    useStudyStore.getState().addTopic(sel.id, trimmed)
    butler(voice.study.toast.topicAdded)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{voice.study.sheet.addTopic(sel.name.toUpperCase())}</h2>
      <SheetLabel>{voice.study.sheet.title}</SheetLabel>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={voice.study.sheet.topicPlaceholder}
        className="w-full rounded-[10px] border border-line bg-panel-2 px-3 py-2.5 text-sm text-ink outline-none"
      />
      <SheetActions cta={voice.study.sheet.ctaTopic} onCancel={onClose} onSave={save} />
    </Sheet>
  )
}
