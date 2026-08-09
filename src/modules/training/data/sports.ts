import type { MuscleId, RepStyle, SportId, Workout } from '../types'

/**
 * Muscle maps for the OTHER SPORT flow, resolved at save time like PPL and
 * RUN_MAP — tuning a map later never rewrites history. Coarse by design (the
 * app models 16 muscles, primary ×1 / secondary ×0.5), drawn from the standard
 * biomechanics reading of each sport:
 *
 * - Striking arts generate power by trunk rotation (obliques) with the legs as
 *   the base; grappling arts live on grip (forearms), the pulling chain
 *   (lats/traps/biceps) and hip work.
 * - `repStyle` sets the recovery character the strain engine already models:
 *   'mixed' for explosive/intermittent efforts (acute + DOMS), 'light' for
 *   endurance-flavored sessions (smaller immediate hit, sorer next day).
 */
export const SPORT_MAP: Record<
  SportId,
  { label: string; repStyle: RepStyle; primary: MuscleId[]; secondary: MuscleId[] }
> = {
  // strikes + takedowns + grappling: rotation and the legs drive everything,
  // grip and the pulling chain carry the ground game
  mma: {
    label: 'MMA',
    repStyle: 'mixed',
    primary: ['obliques', 'quads', 'forearms'],
    secondary: ['front-delts', 'triceps', 'lats', 'traps', 'glutes', 'abs'],
  },
  // punching is trunk rotation out through the shoulders; the calves carry
  // the constant bounce, the lats pull every punch back
  boxing: {
    label: 'Boxing',
    repStyle: 'mixed',
    primary: ['obliques', 'front-delts'],
    secondary: ['triceps', 'side-delts', 'abs', 'calves', 'lats'],
  },
  // kicks are rapid pelvic rotation over a pivoting base; knees and the
  // clinch add hip flexion and pulling work
  muaythai: {
    label: 'Muay Thai',
    repStyle: 'mixed',
    primary: ['quads', 'obliques'],
    secondary: ['glutes', 'calves', 'abs', 'hamstrings', 'forearms', 'lats'],
  },
  // level changes and shots load the legs, the clinch lives on traps and grip,
  // bridging on the lower back
  wrestling: {
    label: 'Wrestling',
    repStyle: 'mixed',
    primary: ['quads', 'traps', 'forearms'],
    secondary: ['glutes', 'hamstrings', 'lower-back', 'lats', 'biceps', 'abs'],
  },
  // grip is the limiter; guard work is hip flexion and trunk tension, and the
  // upper traps are under pressure in every scramble
  bjj: {
    label: 'BJJ / Grappling',
    repStyle: 'light',
    primary: ['forearms', 'lats', 'abs'],
    secondary: ['biceps', 'obliques', 'hamstrings', 'glutes', 'traps', 'chest'],
  },
  // every stroke is trunk rotation through a gripped racquet; lunges and split
  // steps keep the legs honest
  tennis: {
    label: 'Tennis',
    repStyle: 'light',
    primary: ['obliques', 'forearms'],
    secondary: ['front-delts', 'side-delts', 'triceps', 'quads', 'glutes', 'calves'],
  },
  // propulsion is the pull — lats and chest, finished by the triceps; the body
  // line is core tension and the kick is a light quad flutter
  swimming: {
    label: 'Swimming',
    repStyle: 'light',
    primary: ['lats', 'chest'],
    secondary: ['triceps', 'front-delts', 'side-delts', 'biceps', 'abs', 'quads'],
  },
  // jumps and sprints: knee extensors and the calves, with the hips and trunk
  // absorbing landings and cuts
  basketball: {
    label: 'Basketball',
    repStyle: 'light',
    primary: ['quads', 'calves'],
    secondary: ['glutes', 'hamstrings', 'abs', 'obliques'],
  },
  // sprinting and kicking: quads strike the ball, hamstrings brake every
  // sprint (their injury record says how hard)
  soccer: {
    label: 'Soccer',
    repStyle: 'light',
    primary: ['quads', 'hamstrings'],
    secondary: ['glutes', 'calves', 'abs', 'obliques'],
  },
  // the pedal stroke is knee and hip extension, nearly all concentric; the
  // lower back holds the posture
  cycling: {
    label: 'Cycling',
    repStyle: 'light',
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'calves', 'lower-back'],
  },
  // grip above all, then the pulling chain; body tension keeps the hips on
  // the wall
  climbing: {
    label: 'Climbing',
    repStyle: 'mixed',
    primary: ['forearms', 'lats'],
    secondary: ['biceps', 'abs', 'obliques', 'rear-delts'],
  },
  // uphill is quads and calves, downhill is the same muscles braking
  // eccentrically; a pack loads the lower back
  hiking: {
    label: 'Hiking',
    repStyle: 'light',
    primary: ['quads', 'calves'],
    secondary: ['glutes', 'hamstrings', 'lower-back'],
  },
}

/** picker order — combat first (the house's own sports), then the rest */
export const SPORT_IDS = Object.keys(SPORT_MAP) as SportId[]

/** the session's sport name, defensive against a hand-edited import */
export function sportLabel(w: Pick<Workout, 'sport'>): string {
  const kind = w.sport?.kind
  return (kind && SPORT_MAP[kind]?.label) || 'Sport'
}
