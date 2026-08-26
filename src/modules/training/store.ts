import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { CatalogueExercise, Workout } from './types'
import { DEFAULT_PROFILE, type Profile } from './lib/nutrition'
import { DEFAULT_SKIN } from '../../core/ui/skins'
import { makeId } from '../../core/ids'
import { adoptLegacyKey } from '../../core/storage'
import { noteDeleted, noteReplaced } from '../../core/sync/intent'

// re-export so training components keep importing makeId from the store barrel
export { makeId }

adoptLegacyKey('majordomo-training', 'batman-workouts')

export const DEFAULT_WEEKLY_GOAL = 4
/** the one ceiling: the goal stepper and the store clamp read the same number
 *  (they disagreed — a stepper that stopped at 14 over a store that took 21) */
export const MAX_WEEKLY_GOAL = 14

interface WorkoutState {
  workouts: Workout[]
  /** target number of workouts for the current calendar week; 0 = no goal set */
  weeklyGoal: number
  /** bodyweight/dimensions + nutrition tunables for the macro engine */
  profile: Profile
  /** exercises the user wrote themselves, for anything the bundled catalogue
   *  does not have. They sit alongside it in the picker and are the only half
   *  of the catalogue that is records — the bundled half is code, identical on
   *  every device, so it is never stored and never synced. */
  customExercises: CatalogueExercise[]
  /** legacy/frozen passthrough — never read or written anymore; typed as a
   *  plain string so pre-pivot ids in old blobs/exports round-trip verbatim */
  skin: string
  addWorkout: (w: Workout) => void
  addCustomExercise: (e: CatalogueExercise) => void
  deleteCustomExercise: (id: string) => void
  updateWorkout: (id: string, patch: Partial<Omit<Workout, 'id'>>) => void
  deleteWorkout: (id: string) => void
  clearAll: () => void
  replaceAll: (workouts: Workout[]) => void
  setWeeklyGoal: (goal: number) => void
  setProfile: (patch: Partial<Profile>) => void
  setSkin: (skin: string) => void
}

const byDateDesc = (a: Workout, b: Workout) => b.performedAt.localeCompare(a.performedAt)
/** the picker reads them alphabetically, so the store holds them that way —
 *  the sync applier owes the same order by hand (registry.ts) */
export const byName = (a: CatalogueExercise, b: CatalogueExercise) => a.name.localeCompare(b.name)

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set, get) => ({
      workouts: [],
      weeklyGoal: DEFAULT_WEEKLY_GOAL,
      profile: DEFAULT_PROFILE,
      customExercises: [],
      skin: DEFAULT_SKIN,
      addWorkout: (w) => set((s) => ({ workouts: [...s.workouts, w].sort(byDateDesc) })),
      updateWorkout: (id, patch) =>
        set((s) => ({
          workouts: s.workouts
            .map((w) => (w.id === id ? { ...w, ...patch, id } : w))
            .sort(byDateDesc),
        })),
      deleteWorkout: (id) => {
        set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) }))
        noteDeleted('grounds', 'workout', [id])
      },
      clearAll: () => {
        // signed in, this empties the log on every device — the confirm copy
        // in the gear menu has to stop promising "on this device"
        const ids = get().workouts.map((w) => w.id)
        set({ workouts: [] })
        noteDeleted('grounds', 'workout', ids)
      },
      replaceAll: (workouts) => {
        const before = get().workouts.map((w) => w.id)
        set({ workouts: [...workouts].sort(byDateDesc) })
        noteReplaced(
          'grounds',
          'workout',
          before,
          workouts.map((w) => w.id),
        )
      },
      addCustomExercise: (e) =>
        set((s) => ({ customExercises: [...s.customExercises, e].sort(byName) })),
      // no surface calls this yet: a delete path has to exist alongside the
      // tombstone it owes, not be added later on top of records already synced
      deleteCustomExercise: (id) => {
        set((s) => ({ customExercises: s.customExercises.filter((e) => e.id !== id) }))
        noteDeleted('grounds', 'exercise', [id])
      },
      setWeeklyGoal: (goal) =>
        set({ weeklyGoal: Math.max(0, Math.min(MAX_WEEKLY_GOAL, Math.round(goal))) }),
      setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
      setSkin: (skin) => set({ skin }),
    }),
    {
      name: 'majordomo-training',
      // v5: workouts may carry an optional eventId (the Manor block a session
      // fulfils) — additive, so older blobs/exports just come through unlinked
      version: 5,
      storage: createJSONStorage(() => localStorage),
      // customExercises needs no version bump: an older blob simply lacks the
      // key and persist's shallow merge leaves the initializer standing. Only
      // a CHANGED meaning needs a migration.
      partialize: (s) => ({
        workouts: s.workouts,
        weeklyGoal: s.weeklyGoal,
        profile: s.profile,
        customExercises: s.customExercises,
        skin: s.skin,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<
          Pick<WorkoutState, 'workouts' | 'weeklyGoal' | 'profile' | 'customExercises' | 'skin'>
        >
        return {
          workouts: (p.workouts ?? []).map((w) =>
            typeof w.eventId === 'string' || w.eventId === undefined
              ? w
              : { ...w, eventId: undefined },
          ),
          weeklyGoal: p.weeklyGoal ?? DEFAULT_WEEKLY_GOAL,
          // merge so older exports missing new tunables still get sane defaults
          profile: { ...DEFAULT_PROFILE, ...(p.profile ?? {}) },
          customExercises: Array.isArray(p.customExercises) ? p.customExercises : [],
          skin: typeof p.skin === 'string' ? p.skin : DEFAULT_SKIN,
        }
      },
    },
  ),
)

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__store = useWorkoutStore
  import('./lib/strain').then((m) => {
    ;(window as unknown as Record<string, unknown>).__engine = m
  })
  import('./lib/nutrition').then((m) => {
    ;(window as unknown as Record<string, unknown>).__nutrition = m
  })
  import('./lib/volume').then((m) => {
    ;(window as unknown as Record<string, unknown>).__volume = m
  })
  import('./lib/trainNext').then((m) => {
    ;(window as unknown as Record<string, unknown>).__trainNext = m
  })

  // ?demo seeds a fresh browser profile with fixture workouts (screenshot/testing aid)
  if (
    new URLSearchParams(window.location.search).has('demo') &&
    useWorkoutStore.getState().workouts.length === 0
  ) {
    const h = 3_600_000
    const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * h).toISOString()
    const demo = (
      hoursAgo: number,
      ppl: Workout['ppl'],
      primary: Workout['primary'],
      secondary: Workout['secondary'],
      effort: number,
      strainFeel: number,
      repStyle?: Workout['repStyle'],
      extras?: Pick<Workout, 'setsTotal' | 'durationMin'>,
    ): Workout => ({
      id: makeId(),
      performedAt: at(hoursAgo),
      createdAt: at(hoursAgo),
      method: ppl ? 'ppl' : 'custom',
      ppl,
      primary,
      secondary,
      effort,
      strainFeel,
      repStyle,
      ...extras,
    })
    const D = 24
    const demoRun = (hoursAgo: number, distanceKm: number, durationMin: number, effort: number): Workout => ({
      ...demo(hoursAgo, undefined, ['calves', 'quads'], ['hamstrings', 'glutes', 'abs', 'obliques'], effort, 5, 'light'),
      method: 'run',
      run: { distanceKm, durationMin },
    })
    useWorkoutStore.getState().replaceAll([
      demoRun(30, 8, 44, 7),
      // 26:12 — a clock with seconds in it, so the Runs panel isn't demoed
      // exclusively on whole minutes
      demoRun(2 * D + 3, 5.2, 26.2, 6),
      demoRun(4 * D + 6, 12, 70, 8),
      // this calendar week (recent) — note: no legs this week → legs should read behind.
      // The three session-size shapes are all exercised: stated sets + duration,
      // duration only, sets only — the rest estimate from the pick shape.
      demo(2, 'push', ['chest'], ['front-delts', 'side-delts', 'triceps'], 9, 8, 'heavy', {
        setsTotal: 16,
        durationMin: 70,
      }),
      demo(26, 'pull', ['lats'], ['biceps', 'rear-delts', 'forearms', 'traps'], 8, 7, 'light', {
        durationMin: 55,
      }),
      demo(50, undefined, ['abs'], ['obliques'], 6, 5, 'light'),
      // ~1 week ago
      demo(7 * D + 2, 'legs', ['quads', 'hamstrings', 'glutes'], ['calves', 'lower-back'], 9, 8, 'heavy'),
      demo(8 * D, 'push', ['chest'], ['front-delts', 'side-delts', 'triceps'], 7, 6, undefined, {
        setsTotal: 14,
      }),
      demo(9 * D, 'pull', ['lats'], ['biceps', 'rear-delts', 'forearms', 'traps'], 8, 7),
      // ~2 weeks ago
      demo(15 * D, 'legs', ['quads', 'hamstrings', 'glutes'], ['calves', 'lower-back'], 8, 7),
      demo(16 * D, 'push', ['chest'], ['front-delts', 'side-delts', 'triceps'], 8, 8, 'heavy'),
      // ~3 weeks ago
      demo(22 * D, 'legs', ['quads', 'hamstrings', 'glutes'], ['calves', 'lower-back'], 9, 9, 'heavy'),
      demo(23 * D, 'pull', ['lats'], ['biceps', 'rear-delts', 'forearms', 'traps'], 7, 6, 'light'),
    ])
    useWorkoutStore.getState().setWeeklyGoal(4)
  }
}
