import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Workout } from './types'
import { DEFAULT_PROFILE, type Profile } from './lib/nutrition'
import { DEFAULT_SKIN } from '../../core/ui/skins'
import { makeId } from '../../core/ids'
import { adoptLegacyKey } from '../../core/storage'

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
  /** legacy/frozen passthrough — never read or written anymore; typed as a
   *  plain string so pre-pivot ids in old blobs/exports round-trip verbatim */
  skin: string
  addWorkout: (w: Workout) => void
  updateWorkout: (id: string, patch: Partial<Omit<Workout, 'id'>>) => void
  deleteWorkout: (id: string) => void
  clearAll: () => void
  replaceAll: (workouts: Workout[]) => void
  setWeeklyGoal: (goal: number) => void
  setProfile: (patch: Partial<Profile>) => void
  setSkin: (skin: string) => void
}

const byDateDesc = (a: Workout, b: Workout) => b.performedAt.localeCompare(a.performedAt)

export const useWorkoutStore = create<WorkoutState>()(
  persist(
    (set) => ({
      workouts: [],
      weeklyGoal: DEFAULT_WEEKLY_GOAL,
      profile: DEFAULT_PROFILE,
      skin: DEFAULT_SKIN,
      addWorkout: (w) => set((s) => ({ workouts: [...s.workouts, w].sort(byDateDesc) })),
      updateWorkout: (id, patch) =>
        set((s) => ({
          workouts: s.workouts
            .map((w) => (w.id === id ? { ...w, ...patch, id } : w))
            .sort(byDateDesc),
        })),
      deleteWorkout: (id) => set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) })),
      clearAll: () => set({ workouts: [] }),
      replaceAll: (workouts) => set({ workouts: [...workouts].sort(byDateDesc) }),
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
      partialize: (s) => ({
        workouts: s.workouts,
        weeklyGoal: s.weeklyGoal,
        profile: s.profile,
        skin: s.skin,
      }),
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<
          Pick<WorkoutState, 'workouts' | 'weeklyGoal' | 'profile' | 'skin'>
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
    })
    const D = 24
    const demoRun = (hoursAgo: number, distanceKm: number, durationMin: number, effort: number): Workout => ({
      ...demo(hoursAgo, undefined, ['calves', 'quads'], ['hamstrings', 'glutes', 'abs', 'obliques'], effort, 5, 'light'),
      method: 'run',
      run: { distanceKm, durationMin },
    })
    useWorkoutStore.getState().replaceAll([
      demoRun(30, 8, 44, 7),
      demoRun(4 * D + 6, 12, 70, 8),
      // this calendar week (recent) — note: no legs this week → legs should read "slacking"
      demo(2, 'push', ['chest'], ['front-delts', 'side-delts', 'triceps'], 9, 8, 'heavy'),
      demo(26, 'pull', ['lats'], ['biceps', 'rear-delts', 'forearms', 'traps'], 8, 7, 'light'),
      demo(50, undefined, ['abs'], ['obliques'], 6, 5, 'light'),
      // ~1 week ago
      demo(7 * D + 2, 'legs', ['quads', 'hamstrings', 'glutes'], ['calves', 'lower-back'], 9, 8, 'heavy'),
      demo(8 * D, 'push', ['chest'], ['front-delts', 'side-delts', 'triceps'], 7, 6),
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
