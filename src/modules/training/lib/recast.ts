import { totalSets, type DraftExercise } from './exercises'
import { runFieldSeconds, type RunFields } from '../components/add/RunStep'
import { formatClock, formatKm } from './runs'

/**
 * RECASTING — changing the method a session is logged under, mid-edit.
 *
 * The add sheet's method step is reachable from an EXISTING session: back out
 * of the effort step twice and the picker is standing there. Choosing another
 * door from it rewrites the record, because save writes every method's fields
 * unconditionally — a session saved as a run carries `exercises: undefined`,
 * and the shallow merge in `updateWorkout` makes that a deletion rather than
 * an omission. That is deliberate (a run holding a stale bench press would be
 * a lie), but it must never happen without being said out loud.
 *
 * This module is the saying-out-loud: given the draft and the door about to be
 * taken, it names what the session holds that no other method can carry. It is
 * pure and has no opinion about dialogs — the sheet decides what to do with a
 * loss, and null means the change costs nothing.
 */

/** the doors on the method step. 'exercises' is a DRAFT method only — it saves
 *  as 'custom' with a list attached (see AddWorkoutSheet). */
export type LogMethod = 'ppl' | 'custom' | 'run' | 'sport' | 'exercises'

/** everything the guard needs to see — a slice of the sheet's Draft, so this
 *  never has to learn the rest of it */
export interface RecastDraft {
  method: LogMethod | null
  exercises: DraftExercise[]
  run: RunFields
  setsTotal: string
  durationMin: string
}

/**
 * What a recast would drop. Every field states what the session HOLDS: present
 * means recorded and about to be lost, null means there was nothing to lose.
 *
 * Counts travel as numbers because the sentence has to pluralise them; the
 * run's figures travel pre-formatted, the same division of labour the run
 * step already keeps with `voice.grounds.runTotal`.
 */
export interface RecastLoss {
  /** named lifts and the sets logged under them: the expensive one, and the
   *  only detail in this sheet nobody could re-type from memory */
  exercises: { exercises: number; sets: number } | null
  /** a run's two figures, either of which may stand alone */
  run: { km: string | null; time: string | null } | null
  /** the effort step's two typed session-size boxes */
  setsTotal: number | null
  durationMin: number | null
}

/** the sheet's own `num` rule, kept identical so the guard and save cannot
 *  disagree about what counts as recorded */
function num(s: string): number | null {
  const n = Number(s)
  return s.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
}

function count(s: string): number | null {
  const n = num(s)
  if (n === null) return null
  const r = Math.round(n)
  return r > 0 ? r : null
}

/** conditioning has no working sets to count, so save clears both size boxes */
const isConditioning = (m: LogMethod | null): boolean => m === 'run' || m === 'sport'

/**
 * What changing `draft.method` to `next` would cost, or null if nothing.
 *
 * Only TYPED detail counts. A PPL day, a sport and a muscle selection are each
 * one tap to restore, on the very step that restores them, so stopping the
 * user over those would be noise — this guard has to stay rare enough that it
 * still means something when it does appear.
 *
 * The test is on the method being LEFT, not on whatever the draft happens to
 * still be carrying: a list retained behind an already-recast draft was
 * written off once and must not ask a second time.
 */
export function recastLoss(draft: RecastDraft, next: LogMethod): RecastLoss | null {
  if (next === draft.method) return null

  const exercises =
    draft.method === 'exercises' && draft.exercises.length > 0
      ? { exercises: draft.exercises.length, sets: totalSets(draft.exercises) }
      : null

  const run = (() => {
    if (draft.method !== 'run') return null
    const km = num(draft.run.distanceKm)
    const sec = runFieldSeconds(draft.run)
    if (km === null && sec <= 0) return null
    return { km: km === null ? null : formatKm(km), time: sec > 0 ? formatClock(sec) : null }
  })()

  // the size boxes only die on the way INTO conditioning; every lift method
  // keeps them. A session logged exercise by exercise stores its counted sets
  // in that same box, so naming both would price one loss twice.
  const dropsSize = isConditioning(next) && !isConditioning(draft.method)
  const setsTotal = dropsSize && !exercises ? count(draft.setsTotal) : null
  const durationMin = dropsSize ? count(draft.durationMin) : null

  return exercises || run || setsTotal !== null || durationMin !== null
    ? { exercises, run, setsTotal, durationMin }
    : null
}
