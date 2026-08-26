export type MuscleId =
  | 'chest'
  | 'front-delts'
  | 'side-delts'
  | 'rear-delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'traps'
  | 'lats'
  | 'lower-back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'

export type PplType = 'push' | 'pull' | 'legs'

/** the sports the OTHER SPORT flow offers — muscle maps live in data/sports.ts */
export type SportId =
  | 'mma'
  | 'boxing'
  | 'muaythai'
  | 'wrestling'
  | 'bjj'
  | 'tennis'
  | 'swimming'
  | 'basketball'
  | 'soccer'
  | 'cycling'
  | 'climbing'
  | 'hiking'

/** Sport-only detail. The kind is kept so history can name the session even
    after SPORT_MAP tuning; muscles are still denormalized at save time. */
export interface SportDetail {
  kind: SportId
}
export type BodyView = 'front' | 'back'
/** light = high reps / lower weight · heavy = low reps / higher weight */
export type RepStyle = 'light' | 'mixed' | 'heavy'
export type MuscleGroup = 'chest' | 'shoulders' | 'arms' | 'back' | 'core' | 'legs'

export interface MuscleDef {
  id: MuscleId
  label: string
  group: MuscleGroup
  views: BodyView[]
}

/** Run-only detail. Distance/duration are optional — effort still drives strain. */
export interface RunDetail {
  distanceKm?: number
  durationMin?: number
}

/** One logged set. Both sides are optional: a set can be counted without its
    numbers — someone who taps ADD SET four times and types nothing has still
    told the truth about how much work they did. */
export interface LoggedSet {
  weightKg?: number
  reps?: number
}

/** An exercise as logged INTO a workout. Name and muscles are copied in at save
    time, the same rule PPL follows: later tuning of the catalogue (or of the
    vendor script's muscle map) must never rewrite history. `exerciseId` is a
    link, like eventId — it finds previous sessions and is never required to
    resolve, so a custom exercise the user later deletes leaves this intact. */
export interface LoggedExercise {
  exerciseId: string
  name: string
  primary: MuscleId[]
  secondary: MuscleId[]
  sets: LoggedSet[]
}

/** free-exercise-db's own equipment vocabulary, passed through as a union so
    the vendor script fails loudly if upstream adds a value. */
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'kettlebells'
  | 'bands'
  | 'medicine ball'
  | 'exercise ball'
  | 'e-z curl bar'
  | 'body only'
  | 'other'

/** One entry in the exercise catalogue — bundled (data/exercises.ts, generated)
    or made by the user (the training store's customExercises). Lives here
    rather than beside the generated data so the store and the sync registry can
    name the type without pulling 800 rows into the entry chunk. */
export interface CatalogueExercise {
  id: string
  name: string
  primary: MuscleId[]
  secondary: MuscleId[]
  equipment?: Equipment
}

export interface Workout {
  id: string
  /** When the workout happened (ISO datetime, UTC). Bucketing is always done in local time. */
  performedAt: string
  createdAt: string
  method: 'ppl' | 'custom' | 'run' | 'sport'
  ppl?: PplType
  /** present iff method === 'run' */
  run?: RunDetail
  /** present iff method === 'sport' */
  sport?: SportDetail
  /** Muscles are resolved and stored at save time, even for PPL workouts,
      so later tuning of PPL_MAP never rewrites history. */
  primary: MuscleId[]
  secondary: MuscleId[]
  /** 0–10 */
  effort: number
  /** 0–10 */
  strainFeel: number
  /** roughly how many working sets the whole session held — optional, lifts
      only (runs carry run.durationMin; sports are conditioning). When present
      it replaces the volume estimator's guess. */
  setsTotal?: number
  /** session length in minutes — optional, lifts only */
  durationMin?: number
  /** affects load and recovery speed; absent on older data = 'mixed' */
  repStyle?: RepStyle
  /** the named exercises this session held, in the order they were logged —
      present only when it was logged through the exercise flow. `method` stays
      'custom' for those, so nothing that classifies a session (isLift, the
      weekly goal, the charts) has to learn a new shape. When this is present
      setsTotal is derived from it and volume credits muscles per exercise. */
  exercises?: LoggedExercise[]
  /** id of the Manor training block this session fulfils (auto-matched at
      save). Purely a link: strain never reads it, and a dangling id (block
      later deleted) is treated as unlinked everywhere. */
  eventId?: string
}

/**
 * Runs feed the strain engine like any other session, but they are NOT lifting
 * sessions: they never count toward the weekly workout goal, the weekly chart,
 * or the RP-style set-volume landmarks (those are hypertrophy sets).
 */
export const isRun = (w: Pick<Workout, 'method'>): boolean => w.method === 'run'

/** Sport sessions (MMA, swimming, …) are conditioning like runs: they load the
    body map and cost energy, but they are not lifting sessions either. */
export const isSport = (w: Pick<Workout, 'method'>): boolean => w.method === 'sport'

/** the sessions the weekly goal, the weekly chart and the set-volume
    landmarks actually mean — everything that is not conditioning */
export const isLift = (w: Pick<Workout, 'method'>): boolean => !isRun(w) && !isSport(w)

export interface ExportFile {
  app: 'majordomo-training'
  version: 1
  exportedAt: string
  workouts: Workout[]
}
