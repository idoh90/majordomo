/**
 * Vendors the exercise catalogue into `src/modules/training/data/exercises.ts`.
 *
 *     npm run vendor:exercises
 *
 * Source is free-exercise-db, which is public domain (the Unlicense) — no
 * attribution owed and nothing to honour at runtime, which is exactly why it
 * was chosen over wger (CC-BY-SA, share-alike) and over the paid APIs (a
 * network call this app cannot make on a plane).
 *
 * It is NOT part of `npm run build`, for the same reason `og-render.mjs` is
 * not: the catalogue changes about never, the build runs all day, and a build
 * step that needs the network is a build that breaks on the machine that has
 * none. Output is committed.
 *
 * The source is PINNED to a commit, not to `main`. A dataset that quietly
 * changes under a re-run is a dataset whose diff nobody reads. To take an
 * upstream update: change SOURCE_SHA, re-run this, read the diff and the stats
 * it prints, then commit both files together.
 *
 * Two failures here are deliberately fatal rather than skipped, because both
 * mean the map below has gone stale and silence would ship wrong muscles:
 * an unknown muscle name, and an unknown equipment value.
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const OUT = join(ROOT, 'src', 'modules', 'training', 'data', 'exercises.ts')

const SOURCE_REPO = 'yuhonas/free-exercise-db'
const SOURCE_SHA = 'b0eed061e1c832b3ed815fbaa4b45b3cdc14df49'
const SOURCE_URL = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_SHA}/dist/exercises.json`

/**
 * Categories that never become an entry.
 *
 * `stretching` because a stretch is not a working set and would pollute every
 * muscle search with things nobody logs sets of. `cardio` because the app
 * already has two better doors for it — RUN carries pace and distance, OTHER
 * SPORT carries the sport — and a treadmill row in the lift picker invites
 * logging a run as three sets of nothing.
 */
const DROP_CATEGORIES = new Set(['stretching', 'cardio'])

/**
 * free-exercise-db's 17 muscle names onto the app's 16 plates.
 *
 * Most are a rename. The interesting ones, all judgment calls worth knowing
 * about before trusting a body map:
 *  · `shoulders` is undivided upstream, so it lands on the two heads a press
 *    actually drives; rear-delt work is corrected by OVERRIDES below.
 *  · `middle back` (rhomboids, mid-traps) and `neck` have no plate of their
 *    own and go to the nearest one that does.
 *  · `abductors` are glute medius/minimus. `adductors` have no plate at all —
 *    the inner thigh reads as front-thigh work here, which is the least wrong
 *    of the available lies.
 * The app has no `obliques` source upstream; oblique work arrives only through
 * OVERRIDES or a custom exercise.
 */
const MUSCLE_MAP = {
  chest: ['chest'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms'],
  lats: ['lats'],
  traps: ['traps'],
  glutes: ['glutes'],
  hamstrings: ['hamstrings'],
  calves: ['calves'],
  quadriceps: ['quads'],
  abdominals: ['abs'],
  'lower back': ['lower-back'],
  'middle back': ['traps'],
  neck: ['traps'],
  shoulders: ['front-delts', 'side-delts'],
  abductors: ['glutes'],
  adductors: ['quads'],
}

/**
 * Hand corrections, applied after the map, keyed by upstream id. `primary`
 * replaces the mapped primaries; `secondary`, when given, replaces the mapped
 * secondaries (otherwise the mapped ones stand and the overlap rule below
 * still applies).
 *
 * Two reasons anything is on this list. Upstream has one undivided `shoulders`
 * muscle, so without these a face pull and an overhead press load the same two
 * plates and the rear delt never registers work at all. And upstream has no
 * obliques, so every twist and side bend reads as plain abs.
 *
 * An id here that upstream does not have is a hard error — a corrections table
 * that silently stops applying is worse than none.
 */
const OVERRIDES = {
  // rear delts — upstream calls all of these `shoulders`
  Band_Pull_Apart: { primary: ['rear-delts'] },
  Barbell_Rear_Delt_Row: { primary: ['rear-delts'] },
  Bent_Over_Dumbbell_Rear_Delt_Raise_With_Head_On_Bench: { primary: ['rear-delts'] },
  Cable_Rear_Delt_Fly: { primary: ['rear-delts'] },
  'Dumbbell_Lying_One-Arm_Rear_Lateral_Raise': { primary: ['rear-delts'] },
  Dumbbell_Lying_Rear_Lateral_Raise: { primary: ['rear-delts'] },
  Face_Pull: { primary: ['rear-delts'] },
  Lying_Rear_Delt_Raise: { primary: ['rear-delts'] },
  Reverse_Flyes: { primary: ['rear-delts'] },
  Reverse_Flyes_With_External_Rotation: { primary: ['rear-delts'] },
  Reverse_Machine_Flyes: { primary: ['rear-delts'] },
  'Seated_Bent-Over_Rear_Delt_Raise': { primary: ['rear-delts'] },
  Sled_Reverse_Flye: { primary: ['rear-delts'] },
  // side delts — a lateral raise is the one movement the blanket pair most misreads
  Cable_Seated_Lateral_Raise: { primary: ['side-delts'] },
  'Lateral_Raise_-_With_Bands': { primary: ['side-delts'] },
  'Lying_One-Arm_Lateral_Raise': { primary: ['side-delts'] },
  'One-Arm_Incline_Lateral_Raise': { primary: ['side-delts'] },
  Seated_Side_Lateral_Raise: { primary: ['side-delts'] },
  Side_Lateral_Raise: { primary: ['side-delts'] },
  Side_Laterals_to_Front_Raise: { primary: ['side-delts'], secondary: ['front-delts', 'traps'] },
  // front delts
  Front_Dumbbell_Raise: { primary: ['front-delts'] },
  Front_Plate_Raise: { primary: ['front-delts'] },
  // obliques — upstream has no such muscle, so these all arrive as `abdominals`
  Barbell_Side_Bend: { primary: ['obliques'], secondary: ['abs', 'lower-back'] },
  Cable_Russian_Twists: { primary: ['obliques'], secondary: ['abs'] },
  Decline_Oblique_Crunch: { primary: ['obliques'], secondary: ['abs'] },
  Dumbbell_Side_Bend: { primary: ['obliques'], secondary: ['abs'] },
  'One-Arm_High-Pulley_Cable_Side_Bends': { primary: ['obliques'], secondary: ['abs'] },
  Oblique_Crunches: { primary: ['obliques'], secondary: ['abs'] },
  'Oblique_Crunches_-_On_The_Floor': { primary: ['obliques'], secondary: ['abs'] },
  Russian_Twist: { primary: ['obliques'], secondary: ['abs', 'lower-back'] },
  Side_Bridge: { primary: ['obliques'], secondary: ['abs'] },
  Weighted_Ball_Side_Bend: { primary: ['obliques'], secondary: ['abs'] },
  // a crunch that adds a twist is still mostly a crunch
  Bosu_Ball_Cable_Crunch_With_Side_Bends: { primary: ['abs'], secondary: ['obliques'] },
  Kneeling_Cable_Crunch_With_Alternating_Oblique_Twists: {
    primary: ['abs'],
    secondary: ['obliques'],
  },
}

/** must match the Equipment union in src/modules/training/types.ts */
const EQUIPMENT = new Set([
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebells',
  'bands',
  'medicine ball',
  'exercise ball',
  'e-z curl bar',
  'body only',
  'other',
])

const die = (msg) => {
  console.error(msg)
  process.exit(2)
}

const res = await fetch(SOURCE_URL).catch((e) =>
  die(`Could not reach the source: ${String(e).split('\n')[0]}`),
)
if (!res.ok) die(`Source responded ${res.status} ${res.statusText}\n  ${SOURCE_URL}`)
const raw = await res.json()
if (!Array.isArray(raw)) die('Source is not a JSON array — has dist/exercises.json moved?')

const mapMuscles = (names, where) =>
  names.flatMap((n) => {
    const mapped = MUSCLE_MAP[n]
    if (!mapped) {
      die(
        `Unknown muscle "${n}" on ${where}.\n` +
          'Upstream added a muscle name. Add it to MUSCLE_MAP and re-run.',
      )
    }
    return mapped
  })

const unknownOverrides = Object.keys(OVERRIDES).filter((id) => !raw.some((e) => e.id === id))
if (unknownOverrides.length) {
  die(
    `OVERRIDES names ${unknownOverrides.length} exercise(s) this source does not have:\n` +
      unknownOverrides.map((id) => `  ${id}`).join('\n') +
      '\nUpstream renamed or removed them. Fix the keys and re-run.',
  )
}

const kept = []
const dropped = { category: 0, noPrimary: 0 }

for (const e of raw) {
  if (DROP_CATEGORIES.has(e.category)) {
    dropped.category++
    continue
  }
  if (e.equipment != null && !EQUIPMENT.has(e.equipment)) {
    die(
      `Unknown equipment "${e.equipment}" on ${e.id}.\n` +
        'Add it to EQUIPMENT here and to the Equipment union in types.ts, then re-run.',
    )
  }

  const override = OVERRIDES[e.id]
  const primary = [...new Set(override?.primary ?? mapMuscles(e.primaryMuscles ?? [], e.id))]
  const mappedSecondary = override?.secondary ?? mapMuscles(e.secondaryMuscles ?? [], e.id)
  // a muscle taking the brunt is not also assisting — the halved role would
  // otherwise credit the same plate twice from one exercise
  const secondary = [...new Set(mappedSecondary)].filter((m) => !primary.includes(m))

  if (primary.length === 0) {
    dropped.noPrimary++
    continue
  }

  kept.push({
    id: e.id,
    name: e.name,
    primary,
    secondary,
    ...(e.equipment ? { equipment: e.equipment } : {}),
  })
}

kept.sort((a, b) => a.name.localeCompare(b.name))

const header = `// GENERATED by scripts/vendor-exercises.mjs — DO NOT EDIT BY HAND.
//
// Source: ${SOURCE_REPO} @ ${SOURCE_SHA.slice(0, 7)} (public domain, the Unlicense).
// Re-generate with \`npm run vendor:exercises\`; the script's header explains
// how to take an upstream update and what the muscle mapping decides.
//
// This module is only ever reached through a dynamic import (data/catalogue.ts)
// so it lands in its own chunk instead of the entry bundle. The annotation is
// explicit on purpose: without it tsc infers ~${kept.length} literal types, twice per build.
import type { CatalogueExercise } from '../types'

export const EXERCISE_CATALOGUE: CatalogueExercise[] = [
`

const body = kept.map((e) => `  ${JSON.stringify(e)},`).join('\n')
writeFileSync(OUT, `${header}${body}\n]\n`)

const primaryCounts = {}
for (const e of kept) for (const m of e.primary) primaryCounts[m] = (primaryCounts[m] ?? 0) + 1

console.log(`Wrote ${OUT}`)
console.log(`  kept ${kept.length} · dropped ${dropped.category} by category, ${dropped.noPrimary} with no primary muscle`)
console.log('  primary-muscle coverage:')
for (const [m, n] of Object.entries(primaryCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${m.padEnd(12)} ${n}`)
}
