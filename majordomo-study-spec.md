# MAJORDOMO — The Study Wing Spec
### Full plan for the study-tracker wing · v1 · July 2026
*(Companion to `majordomo-build-plan.md` — same register, same rituals. This
document is the complete spec for the wing named in the §3 backlog as "the
Study wing"; build happens post-M8, slotted as milestones S1–S3 below. The
commercial name is **THE STUDY**; the founder pack calls it **THE ACADEMY**.
Spec only — no source or storage changes accompany this document.)*

---

## §0 · What the wing is

The Study is where studying stops being a vague intention and becomes standing
appointments: user-defined subjects with weekly hour goals, exams with
countdowns, syllabi as topic checklists, homework as discrete dated tasks —
and study sessions that are *planned first and fulfilled later*, so the hours
that count are the hours that happened. It passes the wing-justification test
in both directions: it puts study blocks and deadline markers **on** the
Manor's calendar, and it reads fulfilled hours **from** it. Everything the
wing knows is derived from the one events store plus its own metadata blob;
nothing is double-entered.

## §1 · Locked decisions

1. **Plan-then-fulfill; fulfilled hours only.** Rings and stats count `done`
   sessions at full span and `partial` sessions at their reported `doneH`;
   `planned` and `skipped` count zero. This split is intentional: the Manor
   BriefingStrip's "Xh study" line stays *booked* hours (it reads raw events),
   while the wing reports *fulfilled* hours. Two numbers, two meanings.
2. **Session metadata lives in the study store** —
   `sessions: Record<eventId, SessionMeta>` — never on `CalendarEvent`. Core
   stays wing-agnostic. Orphaned meta (event deleted Manor-side) is invisible
   by construction since everything joins through live event ids; a
   `pruneSessions(liveEventIds)` sweep on wing mount keeps the blob tidy, and
   runs only when `sandbox === null`.
3. **`sourceRef` grammar** (normative): session events carry
   `subj:<subjectId>`; homework due markers `hw:<homeworkId>`; exam-day
   markers `exam:<examId>`; Manor quick-adds carry none until filed (see 10).
   Hours-by-subject is computable from events alone, and the ref survives
   sandbox forks and drags untouched.
4. **Fulfillment is manual, wing-side, zero nagging.** The AWAITING REPORT
   queue lists past study events (`end ≤ now`) whose meta is still `planned`.
   Row actions: DONE / PARTIAL (hours stepper) / SKIPPED, plus a bulk "strike
   the rest as skipped". Reconciliation never mutates the event — only the
   meta. **This is the shared fulfill pattern M7's log-fulfills-block should
   adopt:** fulfillment = wing-owned state keyed by event id.
5. **Retro-log = same sheet; time decides.** One BOOK / LOG A SESSION sheet
   (subject, day + start + duration, optional homework link, note). If
   `end ≤ now` at save, the session is born `done`; otherwise `planned`. No
   separate retro-log flow to learn.
6. **Homework due days and exam days = materialized allDay `marker` events**
   (`source: 'study'`, `sourceRef` per the grammar) — the Manor stays generic,
   riding M8's payday-marker precedent and the future Supabase seam. Store
   actions touching `due`/`on`/`done`/delete write markers through; a
   `reconcileMarkers()` heal pass runs on wing mount (sandbox-guarded).
   Homework done or deleted → marker removed. An exam's marker persists after
   the day (it is history) and dies with the exam record.
7. **Overdue homework trails to today.** Undone homework past its due day has
   its marker moved to the current day by `reconcileMarkers()` — the chip
   follows you until you deal with it. Since the study `Briefing` mounts on
   the Manor, the same (sandbox-guarded) reconcile runs from an effect there
   too, so chips heal and trail even if the wing is never opened.
8. **Compute-on-read.** `studyStats(events, sessions, subjects, now,
   weekStart)` is a pure function in the `watchStats` mold; nothing derived is
   ever persisted.
9. **Exam "Xh logged toward it"** = fulfilled hours for the exam's subject
   with `start >= countFrom`. `countFrom` is seeded to the exam's creation
   instant; editing it is deferred (the data supports it already).
10. **Unfiled quick-adds.** Study events added via the Manor quick-add
    (source `'manual'`, no ref) appear in the AWAITING REPORT queue with a
    subject picker; filing sets `sourceRef` via `updateEvent` and writes the
    session meta. Nothing is lost for having been added in the wrong room.
11. **Sandbox rules.** Meta writes are always safe (event ids are stable
    across the fork); `reconcileMarkers` and `pruneSessions` run only when
    `sandbox === null`; booking a session while sandboxed lands in the draft
    like any other edit, and discards with it.
12. **Rings hero.** One ring per active subject — fulfilled-this-week vs
    weekly goal — user-ordered, fixed ~130px, wrapping; a "+n more" collapse
    past 8. Archiving subjects is the real inflation valve. Goal 0 renders a
    faint full circle with hours only. All rings `var(--color-w-study)` in v1;
    per-subject hue is deferred to the design session.
13. **Tab order** becomes MANOR / WATCH / GROUNDS / STUDY / LEDGER — the
    `CONSOLES` array reorders so the Ledger goes last.

## §2 · Data model

```ts
// modules/study/types.ts
interface Subject       { id; name; goalH: number /* 0 = none */; order: number; archived?: boolean; createdAt }
interface SyllabusTopic { id; subjectId; title; covered: boolean; order: number }
interface Homework      { id; subjectId; title; due?: string /* ISO local-day */; done: boolean; doneAt?; createdAt }
interface Exam          { id; subjectId; title; on: string; countFrom: string; notes? }
type Fulfillment = 'planned' | 'done' | 'partial' | 'skipped'
interface SessionMeta   { fulfillment: Fulfillment; doneH?: number; homeworkId?: string; topicIds?: string[] /* reserved */ }
```

Store `majordomo-study` v1 — zustand persist, following the training store's
partialize/versioned-migrate pattern. Collections
`subjects / topics / homework / exams / sessions`; actions
`addSubject / updateSubject / archiveSubject / deleteSubject` (hard delete
cascades topics, homework, exams **and their markers**),
`addTopic / toggleTopic / deleteTopic`,
`addHomework / updateHomework / setHomeworkDone / deleteHomework`,
`addExam / updateExam / deleteExam` (marker write-through on all of these),
`setSessionMeta / fulfill / pruneSessions`.

Subject archive is the soft path; hard delete is a confirm + cascade. **Session
events stay on the calendar either way** — they are history; stats simply
ignore `subj:` refs they no longer recognize. All event writes go through
`useEventsStore` actions (module→core import, the Watch precedent).

## §3 · The screen *(design session held; direction 1a "spec-literal" chosen)*

The design session ("The Study - Design Session.dc.html", project
`Majordomo: Calendar OS`) tried three desktop directions over one live
prototype; **1a — Watch rails, plain glow rings — is the build target**, and
mobile follows 1a stacked (card 1d). Structural template is the Watch: the
two-rail `[300px_1fr]` layout, with the hero and exam strip full-width above
the rails.

```
THE READING THIS WEEK    — rings row (one per active subject) + [+ ENROL A SUBJECT]
MATTERS PENDING          — exam countdown cards: "PHYSICS · in 18 days · 9.0h logged toward it"
THE DESK (left rail)     — [BOOK / LOG A SESSION] · AWAITING REPORT queue (incl. unfiled filing)
                           · THIS WEEK'S LEDGER (sessions with status chips)
THE DOSSIER (right rail) — subject chips · weekly goal editor · HOMEWORK list (due/done)
                           · SYLLABUS checklist with % covered · add homework / topic / exam
                           · archive / rename
```

Sheets via `core/ui/Sheet`. The session's component files (Study Header /
Study Desk / Study Dossier) carry the pixel decisions; the finished butler
copy in its prototype is the voice wave's source of truth.

## §4 · The Manor contract

- **Events written.** Sessions:
  `{ source: 'study', sourceRef: 'subj:<id>', kind: 'study', title, start, end }`.
  Markers: allDay `{ source: 'study', sourceRef: 'hw:<id>' | 'exam:<id>', kind: 'marker' }`
  anchored to the due/exam local day.
- **Marker lifecycle.** Write-through on create/edit/done/delete;
  `reconcileMarkers()` heals drift on wing mount and from the Manor-mounted
  Briefing effect (both sandbox-guarded). Overdue undone homework markers
  trail to the current day (§1.7). A Manor-side chip deletion heals back on
  the next reconcile — the records are the truth.
- **Quick-add interop.** Manual study events surface in AWAITING REPORT for
  filing (§1.10); until filed they count toward no subject.
- **What-if.** Study events fork and diff like any other kind — the
  DIFFERENCE panel's study row already exists. Wing-side reconciles stay
  silent while a sandbox is open.
- **The Briefing.** The study `Briefing` renders on ManorScreen alongside the
  other wings' lines (§5 for its content), and hosts the reconcile effect.
- **Shared pattern.** The fulfillment queue (§1.4) is the reference
  implementation for M7's log-fulfills-block: wings own fulfillment state,
  keyed by event id; events are never annotated.

## §5 · Voice

VoicePack delta: `modules.study` (tab + screen naming) plus a new
`study: {...}` section — screen titles, sheet labels, fulfillment labels,
toasts, marker-title functions `hwDue(title)` / `examDay(title)`, and the
countdown/briefing functions. Both packs get the full wave; **the founder
pack names the wing THE ACADEMY**, and since `packs/founder.ts` overrides the
whole `modules` block without spread, `modules.study` must be added there
explicitly.

Briefing line priority: next exam first —
*"The Physics exam in 12 days, sir — nine hours on the books."* — else the
nearest due homework, else the weekly standing. **No subjects → no line**;
silence over noise. Voice bible as ever: dry, at most one sentence-final
"sir", never begs, no emoji.

## §6 · Build milestones (slot into the backlog, post-M8)

| # | Milestone | Contents | Gate |
|---|---|---|---|
| S1 | The enrolment | `modules/study` types + store v1 · voice wave (both packs, Academy) · `EventSource` gains `'study'` · eslint wing zone · registration in `CONSOLES` + tab reorder (Ledger last) | tab live; subjects persist; other blobs byte-identical; build + lint green |
| S2 | The sessions | BOOK / LOG A SESSION sheet (`subj:` refs, occupancy check → "occupied, sir") · AWAITING REPORT queue with fulfill / partial / skip + unfiled filing · week ledger · `studyStats` + rings hero | booked block appears on the Manor; retro-log fills a ring immediately; sandbox enter + discard leaves `majordomo-study` byte-identical |
| S3 | The deadlines | homework CRUD + due markers + `reconcileMarkers` (incl. overdue trailing) · exams + countdown + hours-toward · syllabus + % covered · Briefing line · `?demo` fixtures | due chip tracks edits, trails past its due day, vanishes on done; Manor-side chip deletion heals on mount; screenshots ×3 presets, desktop + mobile |

## §7 · Deferred (explicit backlog)

Per-subject ring hue · topic-ticking from the session flow (`topicIds`
reserved in `SessionMeta`) · topic reorder · `countFrom` editing UI ·
partial/skipped visuals on Manor blocks · block-trim-to-actual on partial ·
weekly history chart · recurring study blocks (rides the Watch-rotations
backlog item) · timed exam-sitting blocks on the calendar.

## §V · Verification deltas

- **`?demo` fixtures:** literal ids (`demo-subj-math` …); re-source the two
  existing events-demo study blocks (`core/events/store.ts`) to
  `source: 'study'` with `subj:` refs; seed one past-`done` session and one
  awaiting report.
- **Gate screenshot:** partly-filled rings, an exam countdown with
  hours-toward, an awaiting-report row, and a due chip on the Manor — ×3
  presets, desktop + mobile, headless Chrome as ever.
- **Storage:** the new `majordomo-study` blob needs no migration, but the
  backup ritual still precedes the first commit that writes it.
- **Every commit:** `npm run build` + `npm run lint`; reload with real data —
  existing blobs untouched, workout count and net-worth figure unchanged.
