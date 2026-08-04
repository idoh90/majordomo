/**
 * The Study's own records. Study SESSIONS are not here — they are ordinary
 * CalendarEvents (kind 'study') in the shared events store, linked to a
 * subject via `sourceRef: 'subj:<id>'`. This module keeps only what the
 * calendar cannot say: the subject roster, the docket, and per-session
 * fulfillment metadata keyed by event id (events are never annotated).
 */

export interface Subject {
  id: string
  name: string
  /** weekly hours target; 0 = no goal (ring renders quiet, hours still count) */
  goalH: number
  /** ring-row order */
  order: number
  archived?: boolean
  /** ISO instant */
  createdAt: string
}

export interface SyllabusTopic {
  id: string
  subjectId: string
  title: string
  covered: boolean
  order: number
}

export interface Homework {
  id: string
  subjectId: string
  title: string
  /** local day key (YYYY-MM-DD); undefined = no due date, no Manor chip */
  due?: string
  done: boolean
  /** ISO instant */
  doneAt?: string
  /** ISO instant */
  createdAt: string
}

export interface Exam {
  id: string
  subjectId: string
  title: string
  /** local day key (YYYY-MM-DD) of the exam day */
  on: string
  /** ISO instant "hours toward it" counts from (seeded at creation) */
  countFrom: string
  notes?: string
}

export type Fulfillment = 'planned' | 'done' | 'partial' | 'skipped'

export interface SessionMeta {
  fulfillment: Fulfillment
  /** hours actually done when fulfillment === 'partial' */
  doneH?: number
  homeworkId?: string
  /** syllabus topics this session covered, ticked when it was reported. A
   *  record of what that hour bought — the topic's own `covered` flag is the
   *  syllabus truth, and the Dossier checklist can still overrule it. */
  topicIds?: string[]
}
