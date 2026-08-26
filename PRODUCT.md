# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — "the rotating striver":** 20–40, shift-based work (security, nursing,
EMS, military, industrial, aviation), trains seriously, studying or side-hustling,
phone-first. The defining pain: *"my schedule wrecks every system I try."* Their
week is 07:00–20:00 today and 19:00–08:00 tomorrow, with sleep displaced, training
squeezed into the cracks, and study pushed onto off-days.

**Secondary:** overloaded students working jobs, medical residents, freelancers
juggling clients, early founders.

**Today, in fact:** one user — the founder, who works the 13-hour rotations the
product is built around and has daily-driven the app through real rotations with
real data. One outside person has looked at it and given a single piece of
qualitative feedback (below). There is no tester cohort and nobody else holds
their own estate.

**A binding audience decision:** the creative aims at discipline culture and
skews masculine, but the product is never gated or labelled "for men." The
largest shift-worker community online is nurses. The butler bows to everyone.

## Product Purpose

A calendar-first life operating system for people whose working hours fight back.
The calendar ingests the whole life — shifts, sleep, training, study, money — and
arranges it around a schedule that no ordinary calendar can represent.

Success is retention, not reach: a week that finally makes sense, revisited daily
before and after shift, with enough accumulated history that leaving costs
something.

## Positioning

*Shift apps track your shifts. Calendar apps ignore them. Majordomo runs your
whole life around them.*

The mechanism a neighbouring product cannot truthfully copy: cross-midnight work
is native data, not a workaround. A 19:00→08:00 watch is one event with an
exclusive end, never day-bucketed; sleep displaced by a night rotation is a
first-class concept the app pencils in for you; and every derived figure — hours
stood watch, training load, study hours before an exam — is computed from that
same honest shape. Everything downstream (shift-aware briefing timing, the
what-if sandbox, strain that knows when you are already worn) is only possible
because the data model refused to assume a 9-to-5.

## Operating Context

- **Phone-first, mid-shift.** Checked in the minutes before and after a rotation,
  often one-handed, often in the dark, often on bad or absent network.
- **Offline is the operating condition, not an edge case.** The estate lives in
  localStorage and the app boots from it synchronously — no async gate, no
  spinner, no session check between a person and their own records. The shell
  being fetchable is the only thing between the app and a flight.
- **Installed as a PWA** on the home screen; also used in a desktop browser.
- **Six wings, one shell:** the Manor (the week/month calendar — home), the Watch
  (shifts), the Grounds (training), the Study (subjects, homework, exams), the
  Workshop (ventures, bench hours, milestones, pegboards), the Ledger (net worth
  and budget).
- **A single deployed estate.** Origins do not share storage, so moving between
  local and deployed is a deliberate export/import ritual, and that backup file is
  the only backup the financial data has.
- **Live at** https://majordomo-cyan.vercel.app (private, noindex).

## Capabilities and Constraints

**Confirmed and shipped:** seamed week grid and month view with cross-midnight
continuation · pointer drag with occupancy checks, confirm, toast and single-slot
undo · quick-add · the what-if sandbox (draft fork, ghosts, a before→after
difference panel, APPLY/Discard) · shift shapes and a posting flow that pencils
recovery sleep after nights · a real biphasic strain engine feeding both the
Grounds and the Manor · weekly volume against RP-style landmarks · a
training-aware nutrition engine · subjects with weekly-hour rings,
plan-then-fulfil sessions, homework and exam markers, syllabus checklists ·
manual net worth, live-priced holdings, a month-paged spend history · per-wing
briefings · three commercial presets · backup export/import · offline precaching.

**Terminology (fixed, user-facing):** the estate · the Manor · Wings · the Watch
(a *watch* is one posted shift) · the Grounds · the Study · the Ledger · the
Majordomo · "sir."

**Durable constraints:**

- Real single-user data lives in browser storage with no authoritative backend.
  Every migration must be lossless and preceded by a backup.
- Accounts exist only as a registry (a free-tier Postgres project that pauses when
  idle). Sign-in is a door, never a wall: the estate works signed-out forever.
- All new user-facing strings go through the voice module. No inline copy.
- The Grounds keeps every pre-existing training feature; a newer design that omits
  an old feature loses to the old feature.
- Wings may not import each other; a shared kernel is extracted only on second
  contact, never designed up front.
- A wing must justify itself by putting something on the calendar or reading
  something from it. A wing that does not touch time does not belong.
- Verification is done in a real browser. There is no test runner except one
  numeric harness over the calendar's contract.
- English UI, left-to-right, for now. Hebrew content types and displays fine; the
  chrome is not translated and new surfaces carry no mirroring obligation.

**Committed, details open — the natural-language assistant.** A summonable butler
that answers questions about the real week and executes changes through the same
store actions every sheet and drag already uses, plus a first-run conversation
that interviews a new user and builds their estate for them. It is committed;
these remain undecided and must not be presented as settled:

- its name (working title "the Bell");
- the model, and whether the first-run conversation uses a stronger one;
- how many events a plan must touch before it is staged in the what-if sandbox
  instead of applied directly (proposed: three);
- how much of the Ledger it may read or write, if any;
- tier, price, trial length and free-tier allowance;
- whether it requires sign-in (proposed: yes, for metering).

**Built, awaiting arming:** two-way Google Calendar sync (settings → CALENDARS) —
the estate's bookings go to an app-created "Majordomo" calendar in the user's
Google account, Google's own events arrive as read-only blocks that hold their
hours. The code ships dormant: it needs the Google Cloud OAuth client, the
`gcal_accounts` migration and `GCAL_ENABLED=1` before the door opens (playbook
§3.3.1's verification warning applies from the moment the consent screen exists).

**Not built, and not to be described as existing:** onboarding or first-run flow ·
payments or any paid tier · push notifications and the
shift-aware briefing schedule · the weekly report card · app-store presence ·
persona or Hebrew voice packs · a public landing page or waitlist.

**Permanently refused** unless data says otherwise: a habit tracker, notes, a
social feed, and chat as the primary interface. The assistant is a layer over the
calendar, never a replacement for it.

## Brand Commitments

- **Name:** Majordomo. The organizing metaphor is fixed: your life is an estate,
  the app is the majordomo who runs it.
- **The voice is the moat.** Dry, composed, understatement over exclamation. "Sir"
  once per message, sentence-final. Never begs, never guilts, never uses an emoji.
  Competence is the affection. Errors state fact plus remedy. Never impressed,
  never surprised — occasionally, quietly satisfied.
- **The anti-Duolingo rule.** A missed week earns dry acknowledgment, never shame.
  No mascot, no guilt, no nagging. This extends to monetization copy.
- **Copy is design.** Empty states, errors and confirmations in the Majordomo's
  register are the product's smile, not filler.
- **Nothing that requires explaining.** If a screen needs a tutorial, the screen
  is wrong.
- **Three presets ship:** Midnight, Terminal, Aurora. Dark-first is a deliberate
  brand statement; light mode is backlog until users demand it.
- **The Batman-era identity never ships.** It survives only behind a local flag on
  the founder's machine, tree-shaken from any build, and a brand gate greps the
  output to prove it.

## Evidence on Hand

**Real:**

- A working, deployed, installable app with the founder's own months of genuine
  data behind it — real rotations, real workouts, real money.
- Demo fixtures (`?demo`) that populate a plausible brutal week for screenshots.
- Strategy and engineering docs in the repo root: `majordomo-playbook.md`,
  `majordomo-build-plan.md`, `majordomo-study-spec.md`,
  `majordomo-assistant-spec.md`, plus a landing-page spec and design brief.
- One external qualitative data point: a first outside viewer said the app looks
  great but is *"complicated as hell for a new user."* That is the entire body of
  outside feedback, and it is the reason first-run design matters now.

**Absent — future work must not fabricate these:** testimonials, customer quotes,
a beta cohort, retention or activation numbers, user counts, revenue, press,
awards, app-store ratings, integrations, or any claim that other people use this.
Prices and tiers in the strategy docs are proposals, not live offers.

## Product Principles

1. **The calendar is the product.** Wings are extensions that earn their place by
   touching time. Nothing becomes a bundle of dashboards.
2. **Shift-literate by default.** Cross-midnight work, displaced sleep and
   rotation are the normal case the model is built for, never a special case
   patched on top.
3. **The device is the source of truth.** Offline works, boots instantly, and owes
   no one a session. Sign-in is a door, never a wall.
4. **Nothing displays one number and stores another.** A typed value is never
   silently dropped, clamped or rewritten; when a figure cannot be computed
   honestly the surface says so instead of printing a comforting zero.
5. **Respect, not nagging, and no tutorials.** The product assumes a competent
   adult under load: it states facts, offers remedies, and stays out of the way.

## Accessibility & Inclusion

No formal conformance standard has been chosen — that decision is open. Confirmed
product-specific needs:

- **Reduced motion is respected** in the stylesheet and in wing code; interactive
  motion stays in the 150–250ms band and no ambient background motion ships (it
  was built, then removed for idle cost on old machines).
- **One-handed, low-light, mid-shift use** is the real scene. Tap-target audits
  have been run across the wings and are a recurring gate, not a one-off.
- **Money can be blurred on screen** by preference, and that courtesy is expected
  to extend anywhere figures travel.
- **Never gated or labelled by gender**, despite masculine-coded creative.
