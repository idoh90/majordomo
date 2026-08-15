# Majordomo — nutrition engine spec

The model behind `src/modules/training/lib/nutrition.ts`. It exists so the
coefficients in that file can be argued with: every number below is either a
reading of the literature or an engineering estimate, and this document says
which.

## 0. What this engine is, and is not

It computes **targets**, from body stats and the sessions actually logged. It
does not track food, and there is no plan to. The app knows what you trained;
it does not know what you ate, and a number it cannot verify is a number it
should not pretend to hold.

Consequently every figure here is a *recommendation for the day*, recomputed
from raw workouts on every read and never persisted. Tuning a coefficient
rewrites history's advice, which is correct — the advice was always an
estimate of the same underlying physiology.

## 1. Three currencies

The engine deliberately keeps three units apart. Collapsing them is the bug the
previous version had.

| Currency | Function | Unit | Drives |
|---|---|---|---|
| Energy | `workoutKcal` | kcal, net of rest | calories, conditioning's carb bump |
| Load | `workoutWeightedSets` | weighted set-equivalents | the chronic carbohydrate floor |
| Protein | `proteinPerKgFor` | g/kg bodyweight | the day's protein |

A run has no sets, but it has both an energy cost (large) and a glycogen
demand that is fairly described as "worth about this many sets" (moderate).
Pricing its calories through the set currency is what made an hour on the road
cost the same as an hour in the gym.

## 2. The day, in order

```
rest maintenance  = BMR(Mifflin–St Jeor) × restActivityFactor
                    ── no training baked in; sessions are added explicitly
exercise          = Σ workoutKcal(session)          ── the day's own log
goal adjustment   = bulk:    +surplusKcal on TRAINING days
                    cut:     −deficitKcal EVERY day
                    maintain: 0
calories          = max(maintenance + exercise + goal, protein·4 + fatFloor·9)
protein           = proteinPerKg (+0.5 cutting) (+0.1 if trained) × kg
carbohydrate      = chronic floor + acute per-session bump
fat               = the remainder, held above fatFloorGkg (trimming carbs)
```

**BMR — Mifflin–St Jeor.** The most validated predictive equation in
non-obese adults (Frankenfield 2005 systematic review). Harris–Benedict
over-predicts; Katch–McArdle needs a body-fat figure the app does not have.

**Why exercise is added explicitly.** The activity factor covers living, not
lifting (default 1.4 — desk work with ordinary daily movement). Baking
training into the multiplier is the standard way to double-count it, and it
makes rest days and hard days indistinguishable, which is the opposite of what
this engine is for.

**The calorie floor.** A deficit deep enough to fall below the protein and fat
the day will print anyway is two numbers contradicting each other. The floor
keeps the headline consistent with the plate beneath it, and incidentally
keeps calories above zero — which the Manor's brief gates its prose on.

## 3. Goal modes

| Goal | Calories | Protein | Rationale |
|---|---|---|---|
| **Bulk** | +250 kcal on training days only | base | A lean gain wants a *small* surplus; ~0.25–0.5% BW/week limits fat gain (Garthe 2011; Iraki 2019). Rest days at maintenance keeps the weekly surplus modest. |
| **Maintain** | ±0 | base | Calories follow the training and nothing else. |
| **Cut** | −400 kcal every day | base **+0.5 g/kg** | ~0.5–1% BW/week is the band that preserves lean mass (Helms 2014). Protein rises because a deficit is when protein matters most: 2.3–3.1 g/kg **FFM** in trained lifters cutting (Helms 2014), which for an ordinary body composition lands near +0.4–0.6 g/kg bodyweight. |

**Why the deficit is daily and the surplus is not.** The deficit is subtracted
*after* the session's own energy is added, so a trained day still eats more
than a rest day — calorie cycling falls out of the arithmetic rather than
being a setting anyone has to understand. A bulk's surplus is training-day
only because that is where the surplus can be partitioned into muscle; a
rest-day surplus is mostly just a surplus.

## 4. Session pricing

### Runs — `0.95 kcal · kg⁻¹ · km⁻¹`

The net metabolic cost of level running is very nearly **independent of
speed** per unit distance (the classic Margaria finding, reproduced widely
since; ACSM's running equation carries the same implication). Distance is
therefore the honest input, and it is the one the run sheet already records.

- **Distance logged** → `0.95 × kg × km`.
- **Duration only** → invert the app's own effort model. The run sheet earns
  effort from pace and length as `4·i³·(min/45)^0.6` where `i = easy ÷ pace`
  (`lib/pace.ts`). Solving for `i` from the logged effort gives an intensity,
  clamped to [0.6, 1.5]; speed is `(3600/easyPaceSec)·i` km/h, and distance
  follows. A run priced this way agrees with the sheet that set its effort.
- **Neither** → 30 minutes at the profile's easy pace.

There is **no cap**. A measured run is a measurement; a marathon costs what a
marathon costs.

### Sports — MET-hours

A sport session logs no duration, so it is priced as **one MET-hour scaled by
effort**, less the resting hour it replaces:

```
net kcal = (MET × (0.75 + 0.05 × effort) − 1) × kg × 1 h
```

METs are ACSM-compendium session averages at club intensity, stored per sport
in `data/sports.ts`: MMA 10, Muay Thai / wrestling 9.5, boxing 9, BJJ 8.5,
soccer 8.5, swimming / basketball / cycling 8, climbing 7.5, tennis 7.3,
hiking 5.3. An unrecognised sport (hand-edited import only) falls back to 8.

The effort multiplier spans 0.75–1.25 across the 0–10 slider, which is about
the honest spread between a technical drilling session and hard sparring.

### Lifts — kcal per weighted hard set

`weighted sets × kcalPerSet`, default **20 kcal/set**.

Resistance training costs roughly 5–9 kcal/min including inter-set rest, and
carries an EPOC of ~6–15% of session cost (Børsheim & Bahr 2003). A 60-minute
hypertrophy session therefore nets ~200–300 kcal, and scores 11–14 weighted
sets here — hence ~20. **The previous default of 12 under-priced lifting by
about 40%** and is re-priced by the v6 store migration wherever the dial was
never touched.

Weighted sets come from the session-size ladder, most-informed first: a logged
`setsTotal` verbatim → `durationMin × 18 sets/h` → a flat 14-set base, the
latter two effort-scaled, all multiplied by the average `ENERGY_WEIGHT` of the
primary muscles (large compound movers cost more than isolation work).

**Caps are typo guards, not price controls**: 900 kcal for a session whose
size was measured, 500 for one merely estimated. The old engine capped the
whole *day* at 450 kcal, which flattened two-a-days into one session and
priced a half marathon like an ordinary gym hour.

## 5. Carbohydrate and fat

**Chronic floor** — `carbFloorGkg ± 0.5 g/kg`, sliding with the trailing
7-day average load (8 weighted sets/day ≈ the base rate; a deload sits lower,
a heavy block higher). The 3–4 g/kg band this produces is the moderate-to-high
end of the IOC/ACSM training-diet recommendation (Burke), which is where
hypertrophy training with a protein target this high actually lands.

**Acute bump** — lifting earns `carbPerSet` (8 g) per weighted set;
conditioning earns the glycogen share of the energy it actually spent,
`0.6 × kcal ÷ 4`. Endurance work draws far more of its fuel from glycogen than
a set of curls does, and pricing it by set-equivalents understated it.

**Fat** takes the remainder, floored at `fatFloorGkg` (0.6 g/kg) for endocrine
function; when the remainder would fall short, fat holds at the floor and
carbohydrate is trimmed instead.

## 6. Protein

Total daily intake is what matters; distribution across meals is a
second-order effect and timing is close to irrelevant (Morton 2018 meta;
Schoenfeld & Aragon 2018). The engine therefore sets a daily figure and
divides it by `mealsPerDay` for display only.

The ladder: `proteinPerKg` (default 1.9) **+0.5 while cutting** (Helms 2014)
**+0.1 on days that were trained**. The training-day nudge is small and sits
inside the 1.6–2.2 g/kg band Morton's meta-regression supports; it exists
because the owner asked for a plate that responds to what was logged, and this
is the only protein adjustment the evidence will carry without invention.

## 7. Coefficients

| Field | Default | Band | Touch it when |
|---|---|---|---|
| `restActivityFactor` | 1.4 | 1.3 sedentary – 1.6 on your feet | Weight drifts on rest weeks |
| `proteinPerKg` | 1.9 | 1.6–2.2 | Rarely; the ladder handles goals |
| `surplusKcal` | 250 | 150–400 | Gaining faster than ~0.5% BW/week |
| `deficitKcal` | 400 | 250–750 | Losing outside 0.5–1% BW/week |
| `carbFloorGkg` | 3.0 | 2–5 | Sessions feel flat (raise) |
| `fatFloorGkg` | 0.6 | 0.5–0.8 | Rarely |
| `kcalPerSet` | 20 | 15–25 | Weight trend disagrees with training days |
| `carbPerSet` | 8 | 5–12 | With `carbFloorGkg` |
| `easyPaceSec` | 360 | 180–540 | Whenever easy pace genuinely changes |

**Tuning is done against weekly weight trend, not against this table.** Two
weeks of morning weights, averaged, compared with the goal's expected rate:
if the trend disagrees, the activity factor is the first dial (it carries the
most uncertainty), the goal's surplus/deficit the second.

## 8. Deliberately not modelled

- **Food logging / intake tracking.** See §0.
- **TEF.** ~10% of intake, and it scales with the intake the engine is trying
  to solve for. Folding it in adds a circularity for a rounding error.
- **Body composition.** Protein targets would ideally key off fat-free mass;
  the app does not know it, and asking for a body-fat estimate buys precision
  the user cannot supply accurately.
- **Per-exercise energy vectors, per-set diminishing returns.** The app logs
  sessions, not sets and loads.
- **Adaptive thermogenesis on long cuts.** Real, slow, and better handled by
  the owner nudging the activity factor than by a model guessing at it.

## References

Frankenfield D. et al. (2005) — predictive REE equation validation.
Morton R.W. et al. (2018) — protein dose-response meta-analysis.
Schoenfeld B. & Aragon A. (2018) — per-meal protein distribution.
Helms E. et al. (2014) — protein for lean-mass retention in a deficit.
Garthe I. et al. (2011); Iraki J. et al. (2019) — surplus/deficit rates.
Børsheim E. & Bahr R. (2003) — EPOC after resistance exercise.
Burke L. et al. — IOC/ACSM carbohydrate guidelines for training loads.
ACSM Compendium of Physical Activities — MET values.
