# Design brief — the Majordomo landing page
### A prompt for Claude Design · July 2026

> Design the public landing page for Majordomo's beta waitlist — first as
> **three distinct look directions for the hero**, then (after one is chosen)
> the full page in the winning direction. Everything below is the premise.
> Copy, structure, palette rules, and type are **locked**; composition,
> atmosphere, texture, and rhythm are **yours**. This page must read as the
> same physical object as the app you've already designed (the Manor, the
> Console revamp) — it is the first screenshot of the product anyone sees.

---

## 1 · What Majordomo is (the premise)

A calendar-first life OS with a personality: a dry, deadpan **butler** — the
Majordomo — runs your schedule the way a majordomo runs an estate. The core
product is **the Manor**, a shift-literate week calendar where a 19:00–08:00
night watch lands as one shift, sleep after nights pencils itself in, and a
what-if sandbox lets you drag the week into a different shape before
committing. Modules — **Wings** — extend it: THE WATCH (shifts), THE GROUNDS
(training + strain/recovery), THE STUDY (subjects + exams), THE LEDGER
(money).

**The audience:** rotating shift workers, students with jobs, the
overcommitted — people whose schedule breaks every calendar built for a
9-to-5. They arrive on a phone, from a build-in-public clip or a Reddit
comment, probably tired.

**The page's one job:** an email into the beta waitlist. One page, one field,
one button ("REQUEST AN INVITATION"). No nav, no pricing, no feature grid.
Beta is this autumn, capped at 150 places — the scarcity is real, so the page
never has to shout.

**The governing principle: craft is the proof.** For a product whose pitch is
calm competence, a beautiful, restrained page isn't decoration — it *is* the
argument. If the page feels like a quiet, expensive instrument, the product
promise is already believed.

---

## 2 · The voice you are designing around

**Fusion doctrine.** The *message* is discipline/mission — made for the
disciplined, keep your eyes on the mission. The *register* is the butler's —
dry, composed, understatement. Headlines speak to the mission; microcopy is
where the butler lives ("Very good. Your place is held, sir."). The visitor
should feel **recognized → shown → invited**, in that order.

The page itself behaves like the butler: it asks for exactly one thing,
anticipates every question, and never raises its voice.

**The anti-register (never let the design drift here):** hustle-bro
("CRUSH YOUR WEEK"), AI-hype swarm, SaaS-generic gradients-and-blobs,
desperate patterns (popups, countdowns, bouncing arrows). Zero exclamation
marks, zero emoji, anywhere.

---

## 3 · Locked copy — design with these exact words, no lorem ipsum

**Hero headline:**

> Every mission needs a **MAJORDOMO**.

*Treatment (locked): the sentence sets in ink; MAJORDOMO alone sets in brass —
Big Shoulders, all caps, the only brass text on the page besides the CTA. The
headline IS the wordmark moment; the top-left mark shrinks or vanishes on the
hero. You own everything else about its scale and placement.*

**Subheadline:**
> The calendar for schedules that fight back — nights, doubles, rotations,
> exams. Made for the disciplined.

**Form:** placeholder `you@example.com` · button `REQUEST AN INVITATION` ·
under-form line (small, dim): *Beta this autumn. 150 places. No spam — a
briefing when your invitation is ready.*

**Form states (design all five, not just the empty field):**

| State | Copy |
|---|---|
| Submitting | One moment. |
| Success | Very good. Your place is held, sir. |
| Invalid email | That address won't reach you, sir. |
| Duplicate | Already on the list, sir. Patience. |
| Error | The line is down. Try once more, sir. |

**Demo caption (under the hero demo):** *A 13-hour night watch lands as one
shift. Sleep pencils itself in. Training moves to where recovery says it
should. That's the whole idea.*

**The Wings section** — title `THE WINGS`, kicker *One estate. Choose what it
runs.*, three panels:
> **THE WATCH** — Shifts that cross midnight land whole, and sleep after a
> night is pencilled in before you think to ask.
> **THE GROUNDS** — Training that knows what the schedule did to you: strain,
> recovery, and when it's wise to push.
> **THE STUDY** — Exam dates hold the line; study blocks find the cracks in
> the week.

**What-if strip** — title `ASK "WHAT IF" BEFORE YOU COMMIT`:
> Drag the week into a different shape. Read the difference — hours gained,
> sleep lost, training kept. Apply it, or discard it as if nothing happened.
> No calendar on your phone can do this.

**Briefing section** — title `A BRIEFING BEFORE EVERY SHIFT`:
> Most apps notify you at 07:00. If your watch starts at 19:00, that's the
> middle of your night. Majordomo reads the schedule and times the briefing to
> it — the smallest feature on this page, and the one that proves the point.

Phone-notification mock (HTML, not an image): **Majordomo · 16:30** — *On
tonight, 19:00–08:00. Legs are recovered; the gym fits at 15:00. I'd leave
Thursday alone, sir.*

**Founder note (a letter, not a card — plain text on the background):**
> I work 13-hour rotations. I train. I'm studying toward engineering. Every
> calendar I tried assumed my week was someone else's — so I'm building the
> one that runs mine. If your schedule fights back, this is for you.
> — Ido, building Majordomo in public · (links: X · TikTok)

**FAQ (native details/summary styling, five entries):** When is the beta? ·
What will it cost? · What platforms? · What about my data? · Why "Majordomo"?
(Answers exist and are two sentences each; design the open/closed states.)

**Footer:** repeat of the form, then small and dim: *The estate is being
prepared. We'll hold your place, sir.* · `© 2026 Majordomo · Privacy · Contact`

---

## 4 · Tokens, materials, type (the app's real system — use it verbatim)

| Role | Hex |
|---|---|
| Page background | `#0c1017` |
| Panel / card | `#111826` / `#1a2232` |
| Recessed well ("trough") | `#0b1017` |
| Hairlines | `#1e2739` |
| Ink / dim / faint | `#e6ebf2` / `#8b97a8` / `#5e6a7d` |
| **Brass (marketing accent)** | `#d4ae6a` |
| Product accents — *inside demo/screenshots only* | watch `#7da7d0` · grounds `#68b984` · ledger `#d4ae6a` · study `#a78bda` |

- **Palette doctrine — "Midnight & Brass":** two chrome colors only (midnight
  base + brass). Brass owns the CTA, the highlighted MAJORDOMO, and at most
  one hairline rule. The steel-blue and wing colors appear *only inside
  product imagery* as data — that's where the color variety lives.
- **Type:** Big Shoulders (display: headline, section titles, tracked
  all-caps kickers, every numeral — tabular) + Source Sans 3 (body). No new
  fonts. No gradient text — typography is the branding.
- **Materials:** the app's depth system — panels, a darker recessed *trough*
  that holds the primary instrument, sub-cards inside it. Event blocks use the
  `.booked` material: wing-tinted translucent fill, 3px accent left edge, a
  lighter top hairline; *hatched* variant = sleep the estate pencilled in;
  *dotted top/bottom edge* = a block continuing across midnight.
- **Glow is a state** (the live block, the hovered CTA) — never ambience.
- CTA button: brass fill, `#0c1017` text, Big Shoulders, tracked caps, soft
  brass glow on hover only.

---

## 5 · Page structure (locked order — hero is phase 1's focus)

1. **Hero** — headline, sub, form, under-form line. Must fit above the fold
   at 390×844 *including the button*.
2. **The demo** — an animated week coming to order (built later in code). You
   design its **paused frame**: a seamed week grid in a trough holding — a
   19:00–08:00 night watch split across two day columns with dotted
   continues-edges, a hatched sleep block after it, a training block at
   15:00, a study block, an exam chip, and a briefing chip reading *"Watch at
   19:00. Briefing at 16:30, sir."* The frame must pass for a real app
   screenshot. Where the demo sits relative to the hero is a direction
   variable (see §6).
3. **The Wings** — three panels, each one sentence + one screenshot slot.
4. **What-if strip** — copy + a small ghost-drag visual (a dragged block,
   dashed ghost at origin, a tiny before→after diff panel).
5. **The briefing** — copy + the phone-notification mock.
6. **Founder note** — plain letter, no panel.
7. **FAQ** — five entries.
8. **Footer** — repeat form + sign-off.

---

## 6 · The assignment — phase 1: three hero directions

One file, the three directions side by side (the *Week View Directions*
precedent — that format worked). Each direction: **desktop 1440 + mobile 390**
of the hero + demo (sections 1–2). Name each direction. All three use the
locked copy, the Midnight base, and the type pairing. At least two are
Midnight & Brass; one may argue for an alternate accent from the app's other
presets (steel `#7da7d0` or Terminal mint `#3fe0a8` on true black) if you
believe in it — expect it to lose unless it's remarkable.

**Vary the directions along these axes, and make them distinct at a squint:**

- **Hero composition:** the demo as a dimmed full-bleed backdrop under the
  headline · vs. headline block over a trough-framed demo revealed at the
  fold · vs. a split composition (copy left, the night-watch column right).
- **Type scale:** monumental (headline as the entire hero) vs. restrained
  (more air, smaller voice, the demo does the talking).
- **Structure & texture:** film-grain at whisper opacity, hairline rules,
  a faint blueprint/hour-rule grid, corner ticks — the estate's engineering
  aesthetic. Or none: pure dark air. Pick per direction.
- **Brass deployment:** word + CTA only · vs. word + CTA + one rule/tick
  system. Never more than that.

Annotate intended motion (what drifts, what snaps, what glows) as margin
notes — but design the *still* first; reduced-motion users get exactly it.

## 7 · Phase 2 (after the owner picks a direction)

The full page, sections 1–8, in the chosen direction — desktop + mobile,
every form state, FAQ open/closed, the footer. Same file conventions as the
app's design projects.

---

## 8 · Constraints & non-goals

- **Mobile first.** Design 390px before 1440px. Thumb-reachable form, ≥44px
  targets.
- One CTA on the page (the same form twice). No nav bar. No light mode.
- Visuals are **real UI only** — the demo frame and app screenshots. No stock
  photos, no abstract 3D blobs, no illustrations, no mascots.
- Contrast AA minimum everywhere, checked, not eyeballed (ink on bg ≈ 14:1,
  brass on bg ≈ 9:1 — you have room).
- No new dependencies implied: everything you draw must be buildable as
  DOM + CSS (the demo animates via transforms/opacity later; no video, no
  canvas, no Lottie).
- The five form states and the notification mock are HTML text, never baked
  into images.

## 9 · Acceptance

- **The 3-second test** on the hero alone: what it is (a calendar), who it's
  for (schedules that fight back), what to do (leave an email) — without
  scrolling, at 390px.
- The demo's paused frame could be mistaken for a screenshot of the real
  Manor.
- MAJORDOMO in brass reads as *the* brand moment; nothing on the page
  competes with it except the CTA.
- The three directions are genuinely three — different at a squint, not one
  layout with three textures.
- Nothing anywhere shouts: no exclamation marks, no emoji, no fake urgency.
  The page would rather be underestimated than loud.
