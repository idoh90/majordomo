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

export interface Workout {
  id: string
  /** When the workout happened (ISO datetime, UTC). Bucketing is always done in local time. */
  performedAt: string
  createdAt: string
  method: 'ppl' | 'custom' | 'run'
  ppl?: PplType
  /** present iff method === 'run' */
  run?: RunDetail
  /** Muscles are resolved and stored at save time, even for PPL workouts,
      so later tuning of PPL_MAP never rewrites history. */
  primary: MuscleId[]
  secondary: MuscleId[]
  /** 0–10 */
  effort: number
  /** 0–10 */
  strainFeel: number
  /** affects load and recovery speed; absent on older data = 'mixed' */
  repStyle?: RepStyle
}

/**
 * Runs feed the strain engine like any other session, but they are NOT lifting
 * sessions: they never count toward the weekly workout goal, the weekly chart,
 * or the RP-style set-volume landmarks (those are hypertrophy sets).
 */
export const isRun = (w: Pick<Workout, 'method'>): boolean => w.method === 'run'

export interface ExportFile {
  app: 'majordomo-training'
  version: 1
  exportedAt: string
  workouts: Workout[]
}
