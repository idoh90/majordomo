# The launch dashboard — PostHog setup, click by click

One-time setup after deploying the telemetry build. Total time: ~30 minutes.

## 0. The account (once)

1. Sign up at **eu.posthog.com** (the EU region — the Privacy Policy promises it).
   The free tier (1M events/month) is far more than this launch will use.
2. Create one project ("Majordomo").
3. Copy the **Project API key** (starts `phc_`) from Settings → Project.
4. In Vercel → the majordomo project → Settings → Environment Variables, add
   `VITE_POSTHOG_KEY` = that key, **Production environment ONLY** — previews and local
   dev then send nothing, by design. Redeploy.
5. Sanity check: open majordomocal.com in a private window, agree at the door, click
   around, and watch **Activity** in PostHog show `consent_accepted`, `app_open`,
   `wing_open` within a minute or two.

While in PostHog settings, also set **Project → Discard client IP data: ON** — the
policy says usage counts are pseudonymous; there is no reason to hold IPs.

## 1. The events you have

| Event | Meaning | Properties |
|---|---|---|
| `app_open` | the app came up (or resumed after 30+ min idle) | `standalone`, `resumed?` |
| `consent_accepted` | the door was agreed through | `version` |
| `onboarding_finished` | first-time setup ended (walked or waved off) | — |
| `wing_open` | a wing opened by hand | `wing`: watch / grounds / study / workshop / ledger |
| `watch_posted` | a shift posted | — |
| `workout_logged` | a new workout saved | `kind`: lift / run / sport |
| `event_created` | a calendar block created on the Manor | `via`: grid / quickadd |
| `session_booked` | a study/workshop session booked | `wing` |
| `session_fulfilled` | a session reported on | `wing`, `outcome` |
| `bench_logged` | a bench timer stop that wrote a session | `minutes` |
| `spend_saved` / `snapshot_saved` | Ledger writes | — |
| `card_added` | a pegboard card hung | `kind` |
| `signed_in` | a genuine sign-in (not a session restore) | — |
| `crew_shared` / `crew_joined` | venture sharing (the viral loop) | — |
| `pwa_installed` | added to a home screen | — |
| `telemetry_off` | someone switched analytics off | — |

Every user also carries a `$session_id`, so session counts and durations work.

## 2. The dashboard (create one, pin these insights)

**"Do people come back?" — the launch question**
- *Retention*: New insight → Retention → performed `app_open`, came back and performed
  `app_open`, weekly. This is THE chart: week-1 retention above ~20–30% for a personal
  tool is a real signal.
- *Stickiness*: Trends → `app_open` → shown as Stickiness (how many days per week
  the average user shows up).

**"How many people?"**
- *DAU / WAU / MAU*: Trends → `app_open` → Unique users, three series (daily, weekly,
  monthly grouping or the built-in "Active users" math).
- *Installs*: Trends → `pwa_installed`, cumulative.

**"Which features earn their place?"**
- *Wing adoption*: Trends → `wing_open` → Unique users, broken down by `wing`. Bars,
  last 30 days. Tells you which wings people actually enter.
- *Feature retention*: duplicate the Retention insight but with `wing_open` filtered to
  one wing (e.g. `wing = ledger`) for both events — "of the people who used the Ledger,
  how many came back to it". Repeat per wing you care about. This answers "which
  features do users return to" directly.
- *Depth of use*: Trends → `watch_posted`, `workout_logged`, `event_created`,
  `session_booked`, `spend_saved` as separate series — the writing actions, not just
  the visits.

**"Does the funnel work?"**
- *Activation funnel*: Funnels → `consent_accepted` → any of
  (`watch_posted` OR `workout_logged` OR `event_created` OR `session_booked` OR
  `spend_saved`) → `app_open` with a 7-day conversion window. (PostHog funnels take
  one event per step; use `event_created` as the second step if OR-steps feel fiddly —
  it is the most common first record.) Where people fall out is the launch's to-do list.
- *The crew loop*: Trends → `crew_shared` vs `crew_joined`. If joins ≈ shares, invites
  land; if joins ≪ shares, the invite path leaks.

**Hygiene**
- *Opt-outs*: Trends → `telemetry_off`, cumulative. If this climbs, the disclosure or
  the trust is off somewhere.

## 3. Two habits worth having

- **Subscribe the dashboard** (Dashboards → … → Subscribe) to your email, weekly —
  the numbers come to you instead of you remembering to look.
- **Exclude yourself**: on your own devices, Settings → THE FINE PRINT → switch
  "Share usage counts" off. Your daily use would otherwise be the most loyal user in
  every chart.

## What the numbers can never tell you

No record contents ever leave the app — no amounts, titles, or health numbers — so
PostHog can say *that* the Ledger is used, never *what* is in it. That is by design
and by promise (the Privacy Policy, and `src/core/telemetry/events.ts` which
enforces it in code).
