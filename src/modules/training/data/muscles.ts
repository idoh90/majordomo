import type { MuscleDef, MuscleGroup, MuscleId, PplType } from '../types'

export const MUSCLES: Record<MuscleId, MuscleDef> = {
  chest: { id: 'chest', label: 'Chest', group: 'chest', views: ['front'] },
  'front-delts': { id: 'front-delts', label: 'Front Delts', group: 'shoulders', views: ['front'] },
  'side-delts': { id: 'side-delts', label: 'Side Delts', group: 'shoulders', views: ['front'] },
  'rear-delts': { id: 'rear-delts', label: 'Rear Delts', group: 'shoulders', views: ['back'] },
  biceps: { id: 'biceps', label: 'Biceps', group: 'arms', views: ['front'] },
  triceps: { id: 'triceps', label: 'Triceps', group: 'arms', views: ['back'] },
  forearms: { id: 'forearms', label: 'Forearms', group: 'arms', views: ['front', 'back'] },
  abs: { id: 'abs', label: 'Abs', group: 'core', views: ['front'] },
  obliques: { id: 'obliques', label: 'Obliques', group: 'core', views: ['front'] },
  traps: { id: 'traps', label: 'Traps', group: 'back', views: ['front', 'back'] },
  lats: { id: 'lats', label: 'Lats', group: 'back', views: ['back'] },
  'lower-back': { id: 'lower-back', label: 'Lower Back', group: 'back', views: ['back'] },
  glutes: { id: 'glutes', label: 'Glutes', group: 'legs', views: ['back'] },
  quads: { id: 'quads', label: 'Quads', group: 'legs', views: ['front'] },
  hamstrings: { id: 'hamstrings', label: 'Hamstrings', group: 'legs', views: ['back'] },
  calves: { id: 'calves', label: 'Calves', group: 'legs', views: ['back'] },
}

export const ALL_MUSCLE_IDS = Object.keys(MUSCLES) as MuscleId[]

export const GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  core: 'Core',
  legs: 'Legs',
}

/** Order and grouping of the muscle picker in the add-workout flow. */
export const PICKER_GROUPS: { group: MuscleGroup; muscles: MuscleId[] }[] = [
  { group: 'chest', muscles: ['chest'] },
  { group: 'back', muscles: ['lats', 'traps', 'lower-back'] },
  { group: 'shoulders', muscles: ['front-delts', 'side-delts', 'rear-delts'] },
  { group: 'arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { group: 'core', muscles: ['abs', 'obliques'] },
  { group: 'legs', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
]

export const PPL_MAP: Record<PplType, { primary: MuscleId[]; secondary: MuscleId[] }> = {
  push: { primary: ['chest'], secondary: ['front-delts', 'side-delts', 'triceps'] },
  pull: { primary: ['lats'], secondary: ['biceps', 'rear-delts', 'forearms', 'traps'] },
  legs: { primary: ['quads', 'hamstrings', 'glutes'], secondary: ['calves', 'lower-back'] },
}

export const PPL_LABELS: Record<PplType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
}

export function muscleLabel(id: MuscleId): string {
  return MUSCLES[id].label
}
