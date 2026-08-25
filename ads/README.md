# Ad screenshots

Phone-frame captures of the app for advertising, and the harness that makes them.

Regenerate the whole set (needs the dev server up):

```
npm run dev &
CHROME_PATH=/opt/pw-browsers/chromium node scripts/ad-shots.mjs
```

- `SKIN=terminal` / `SKIN=aurora` — the other two commercial presets
- `SHOTS=01-manor-day,09-ledger-vault` — re-shoot only those frames
- `OUT=…` — write somewhere else · `W`/`H` — a different phone
- Frames are 390×844 at 2× (an iPhone 14), so each PNG is 780×1688.

## What the harness does that `?demo` alone doesn't

`?demo` seeds an honest week — two days old, most rings still at zero. Right for
testing, wrong for an advert, where a ring reading 0.0 says nobody lives here.
So `scripts/ad-shots.mjs` seeds the demo estate and then fills it: six weeks of
back-history behind the current one, a packed day column, a portfolio with rows
enough to read as one. It writes only records the demo already seeds — no new
shapes — through the dev-only `window.__*` store handles, so **no app source is
involved and nothing here can reach a build**.

Two rules the fill keeps, because an advert that lies is worse than a thin one:
nothing already behind us is left merely booked, and nothing in the future is
marked done. The Ledger's snapshots are scaled to the holdings for the same
reason — four new positions against an older snapshot would otherwise have the
house reporting a ₪160,000 gain in a day.

**Every number in these frames is fixture data, not anyone's real records.**

## The frames

| Frame | What it shows |
|---|---|
| 01 manor-day | The packed day: eight blocks between one night watch and the next |
| 02 manor-briefing | The written brief, a clause per wing in that wing's colour |
| 03 manor-instruments | The four dials — body heat, exam countdown, soreness |
| 04 manor-month | A month with something on almost every day |
| 05 grounds-bodymap | The strain body map |
| 06 grounds-volume | The same map in weekly-volume mode |
| 07 grounds-stats | Week goal, what's behind, what's booked, today's macros |
| 08 grounds-charts | Streak, runs, workouts per week, most trained |
| 09 ledger-vault | Net worth, the trend, allocation |
| 10 ledger-portfolio | Allocation over a six-row live portfolio |
| 11 ledger-spending | Spend pace and the full account list |
| 12 study-rings | Four subjects, hours done against the week's goal |
| 13 study-homework | Homework and a syllabus part-covered |
| 14 workshop-bench | Bench hours per venture, and what's overdue |
| 15 workshop-board | The pegboard, on its phone column pager |
| 16 watch-duty | The duty ring, next shift, and the week's 168 hours |
| 17 watch-post | Posting a shift onto the week |

`terminal/` and `aurora/` hold four of these in the other two presets.
