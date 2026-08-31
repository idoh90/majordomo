import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { makeId } from '../../core/ids'
import { localDayKey } from '../../core/dates'
import { voice } from '../../core/voice'
import { noteDeleted } from '../../core/sync/intent'
import { effectiveHwDay, examRef, hwRef, syncMarker } from './lib'
import type { Exam, Fulfillment, Homework, SessionMeta, Subject, SyllabusTopic } from './types'

/**
 * The Study's blob — `majordomo-study` v1. Sessions themselves live in the
 * shared events store; this holds the roster (subjects), the docket
 * (homework/exams/topics) and fulfillment metadata keyed by event id.
 * Homework/exam mutations write their Manor marker through the events store
 * in the same action (`syncMarker`); `reconcileMarkers` heals any drift.
 */

interface StudyState {
  subjects: Subject[]
  topics: SyllabusTopic[]
  homework: Homework[]
  exams: Exam[]
  sessions: Record<string, SessionMeta>

  addSubject: (name: string, goalH: number) => Subject
  updateSubject: (id: string, patch: Partial<Omit<Subject, 'id'>>) => void
  archiveSubject: (id: string) => void
  /** hard delete: cascades topics/homework/exams (and their markers); session
   *  EVENTS stay on the calendar as history — stats ignore unknown refs */
  deleteSubject: (id: string) => void

  addTopic: (subjectId: string, title: string) => void
  updateTopic: (id: string, patch: Partial<Omit<SyllabusTopic, 'id'>>) => void
  toggleTopic: (id: string) => void
  deleteTopic: (id: string) => void

  addHomework: (subjectId: string, title: string, due?: string) => void
  updateHomework: (id: string, patch: Partial<Omit<Homework, 'id'>>) => void
  setHomeworkDone: (id: string, done: boolean) => void
  deleteHomework: (id: string) => void

  addExam: (subjectId: string, title: string, on: string) => void
  updateExam: (id: string, patch: Partial<Omit<Exam, 'id'>>) => void
  deleteExam: (id: string) => void

  setSessionMeta: (eventId: string, meta: SessionMeta) => void
  fulfill: (eventId: string, fulfillment: Fulfillment, doneH?: number) => void
  /** drop metadata whose event no longer exists (call with committed ids only) */
  pruneSessions: (liveEventIds: string[]) => void
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      subjects: [],
      topics: [],
      homework: [],
      exams: [],
      sessions: {},

      addSubject: (name, goalH) => {
        const subject: Subject = {
          id: makeId(),
          name,
          goalH: Math.max(0, goalH),
          order: get().subjects.reduce((m, s) => Math.max(m, s.order + 1), 0),
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ subjects: [...s.subjects, subject].sort(byOrder) }))
        return subject
      },
      updateSubject: (id, patch) =>
        set((s) => ({
          subjects: s.subjects.map((x) => (x.id === id ? { ...x, ...patch, id } : x)).sort(byOrder),
        })),
      archiveSubject: (id) =>
        set((s) => ({
          subjects: s.subjects.map((x) => (x.id === id ? { ...x, archived: true } : x)),
        })),
      deleteSubject: (id) => {
        for (const hw of get().homework.filter((h) => h.subjectId === id)) {
          syncMarker(hwRef(hw.id), null, '')
        }
        for (const x of get().exams.filter((x) => x.subjectId === id)) {
          syncMarker(examRef(x.id), null, '')
        }
        // the cascade has to be declared in full: a subject's topics, homework
        // and exams go with it, and each is its own record
        const before = get()
        noteDeleted('study', 'subject', [id])
        noteDeleted(
          'study',
          'topic',
          before.topics.filter((t) => t.subjectId === id).map((t) => t.id),
        )
        noteDeleted(
          'study',
          'homework',
          before.homework.filter((h) => h.subjectId === id).map((h) => h.id),
        )
        noteDeleted(
          'study',
          'exam',
          before.exams.filter((x) => x.subjectId === id).map((x) => x.id),
        )
        set((s) => ({
          subjects: s.subjects.filter((x) => x.id !== id),
          topics: s.topics.filter((t) => t.subjectId !== id),
          homework: s.homework.filter((h) => h.subjectId !== id),
          exams: s.exams.filter((x) => x.subjectId !== id),
        }))
      },

      addTopic: (subjectId, title) =>
        set((s) => ({
          topics: [
            ...s.topics,
            {
              id: makeId(),
              subjectId,
              title,
              covered: false,
              order: s.topics.reduce((m, t) => Math.max(m, t.order + 1), 0),
            },
          ],
        })),
      updateTopic: (id, patch) =>
        set((s) => ({
          topics: s.topics.map((t) => (t.id === id ? { ...t, ...patch, id } : t)),
        })),
      toggleTopic: (id) =>
        set((s) => ({
          topics: s.topics.map((t) => (t.id === id ? { ...t, covered: !t.covered } : t)),
        })),
      deleteTopic: (id) => {
        set((s) => ({ topics: s.topics.filter((t) => t.id !== id) }))
        noteDeleted('study', 'topic', [id])
      },

      addHomework: (subjectId, title, due) => {
        const hw: Homework = {
          id: makeId(),
          subjectId,
          title,
          due,
          done: false,
          createdAt: new Date().toISOString(),
        }
        set((s) => ({ homework: [...s.homework, hw] }))
        syncMarker(hwRef(hw.id), effectiveHwDay(hw, Date.now()), voice.study.markerHw(hw.title))
      },
      updateHomework: (id, patch) => {
        set((s) => ({
          homework: s.homework.map((h) => (h.id === id ? { ...h, ...patch, id } : h)),
        }))
        const hw = get().homework.find((h) => h.id === id)
        if (hw) syncMarker(hwRef(id), effectiveHwDay(hw, Date.now()), voice.study.markerHw(hw.title))
      },
      setHomeworkDone: (id, done) =>
        get().updateHomework(id, { done, doneAt: done ? new Date().toISOString() : undefined }),
      deleteHomework: (id) => {
        syncMarker(hwRef(id), null, '')
        set((s) => ({ homework: s.homework.filter((h) => h.id !== id) }))
        noteDeleted('study', 'homework', [id])
      },

      addExam: (subjectId, title, on) => {
        const exam: Exam = {
          id: makeId(),
          subjectId,
          title,
          on,
          countFrom: new Date().toISOString(),
        }
        set((s) => ({ exams: [...s.exams, exam] }))
        syncMarker(examRef(exam.id), exam.on, voice.study.markerExam(exam.title))
      },
      updateExam: (id, patch) => {
        set((s) => ({ exams: s.exams.map((x) => (x.id === id ? { ...x, ...patch, id } : x)) }))
        const exam = get().exams.find((x) => x.id === id)
        if (exam) syncMarker(examRef(id), exam.on, voice.study.markerExam(exam.title))
      },
      deleteExam: (id) => {
        syncMarker(examRef(id), null, '')
        set((s) => ({ exams: s.exams.filter((x) => x.id !== id) }))
        noteDeleted('study', 'exam', [id])
      },

      setSessionMeta: (eventId, meta) =>
        set((s) => ({ sessions: { ...s.sessions, [eventId]: meta } })),
      fulfill: (eventId, fulfillment, doneH) =>
        set((s) => ({
          sessions: {
            ...s.sessions,
            [eventId]: { ...(s.sessions[eventId] ?? {}), fulfillment, doneH },
          },
        })),
      /**
       * MUST NEVER record a deletion. This is local garbage collection, not
       * intent: once records arrive from other devices, a session's metadata
       * can land before the event it belongs to, and burying it here would
       * destroy real fulfillment ("done, 1h") that nobody asked to delete.
       * Orphans are provably inert — metaOf only ever looks up by event id, and
       * studyStats walks events rather than sessions — so they cost a few bytes
       * and nothing else. Deleting the failure mode beats guarding it.
       */
      pruneSessions: (liveEventIds) =>
        set((s) => {
          const live = new Set(liveEventIds)
          const kept = Object.entries(s.sessions).filter(([id]) => live.has(id))
          if (kept.length === Object.keys(s.sessions).length) return s
          return { sessions: Object.fromEntries(kept) }
        }),
    }),
    {
      name: 'majordomo-study',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        subjects: s.subjects,
        topics: s.topics,
        homework: s.homework,
        exams: s.exams,
        sessions: s.sessions,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<
          Pick<StudyState, 'subjects' | 'topics' | 'homework' | 'exams' | 'sessions'>
        >
        return {
          subjects: p.subjects ?? [],
          topics: p.topics ?? [],
          homework: p.homework ?? [],
          exams: p.exams ?? [],
          sessions: p.sessions ?? {},
        }
      },
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__study = useStudyStore

  // ?demo seeds the reading room into an empty study store. Session metas key
  // on the literal event ids the events-store demo uses for its study blocks.
  if (
    new URLSearchParams(window.location.search).has('demo') &&
    useStudyStore.getState().subjects.length === 0
  ) {
    const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString()
    const dayKey = (inDays: number) => localDayKey(new Date(Date.now() + inDays * 86_400_000))
    const subj = (id: string, name: string, goalH: number, order: number): Subject => ({
      id,
      name,
      goalH,
      order,
      createdAt: iso(30),
    })
    const topic = (
      subjectId: string,
      title: string,
      covered: boolean,
      order: number,
    ): SyllabusTopic => ({ id: makeId(), subjectId, title, covered, order })
    useStudyStore.setState({
      subjects: [
        subj('demo-subj-math', 'Linear Algebra', 6, 0),
        subj('demo-subj-physics', 'Physics', 5, 1),
        subj('demo-subj-writing', 'Academic Writing', 3, 2),
        subj('demo-subj-spanish', 'Spanish', 2.5, 3),
      ],
      topics: [
        topic('demo-subj-math', 'Vector spaces', true, 0),
        topic('demo-subj-math', 'Linear maps', true, 1),
        topic('demo-subj-math', 'Determinants', true, 2),
        topic('demo-subj-math', 'Eigenvalues & eigenvectors', true, 3),
        topic('demo-subj-math', 'Inner product spaces', false, 4),
        topic('demo-subj-math', 'Spectral theorem', false, 5),
        topic('demo-subj-physics', 'Kinematics', true, 6),
        topic('demo-subj-physics', 'Dynamics', true, 7),
        topic('demo-subj-physics', 'Momentum', false, 8),
        topic('demo-subj-physics', 'Rotation', false, 9),
        topic('demo-subj-writing', 'Thesis statements', true, 10),
        topic('demo-subj-writing', 'Citation & sources', false, 11),
        topic('demo-subj-spanish', 'Past tenses', true, 12),
        topic('demo-subj-spanish', 'Subjunctive', false, 13),
      ],
      homework: [
        {
          id: 'demo-hw-pset',
          subjectId: 'demo-subj-math',
          title: 'Problem set 4',
          due: dayKey(2),
          done: false,
          createdAt: iso(4),
        },
        {
          id: 'demo-hw-lab',
          subjectId: 'demo-subj-physics',
          title: 'Lab write-up — pendulum',
          due: dayKey(4),
          done: false,
          createdAt: iso(3),
        },
        {
          id: 'demo-hw-draft',
          subjectId: 'demo-subj-writing',
          title: 'Chapter 2 draft revision',
          done: false,
          createdAt: iso(2),
        },
        {
          id: 'demo-hw-deck',
          subjectId: 'demo-subj-spanish',
          title: 'Flashcards — deck 12',
          done: true,
          doneAt: iso(1),
          createdAt: iso(6),
        },
      ],
      exams: [
        {
          id: 'demo-exam-midterm',
          subjectId: 'demo-subj-math',
          title: 'Midterm',
          on: dayKey(6),
          countFrom: iso(21),
        },
        {
          id: 'demo-exam-final',
          subjectId: 'demo-subj-physics',
          title: 'Final',
          on: dayKey(18),
          countFrom: iso(14),
        },
      ],
      // the events demo seeds 'demo-study-*' blocks; these reconcile them
      sessions: {
        'demo-study-1': { fulfillment: 'done' },
        'demo-study-2': { fulfillment: 'planned' },
        'demo-study-3': { fulfillment: 'partial', doneH: 1, homeworkId: 'demo-hw-draft' },
      },
    })
  }
}
