import { create } from 'zustand'
import { useAuthStore } from '../../core/auth/store'
import { useEventsStore } from '../../core/events/store'
import { useNavStore } from '../../core/store/nav'
import { useShellStore } from '../../core/store/shell'
import { offReason } from '../../core/sync/gate'
import { useStudyStore } from '../../modules/study/store'
import { useWorkoutStore } from '../../modules/training/store'
import { sweepSample } from './sample'

/**
 * The first-time setup's own state — a stage machine and nothing else.
 *
 * Deliberately NOT persisted in localStorage: the only durable fact worth
 * keeping is "has this device been shown the house", and that is one boolean in
 * the shell store. Where a run has got to is a property of a sitting, and it
 * lives in sessionStorage so an OAuth redirect (which reloads the tab) does not
 * drop the user back at the welcome screen — and so an abandoned half-run
 * evaporates with the tab rather than haunting the next boot.
 *
 * Stage ids are the Bell concierge script's (assistant spec §3.4) on purpose:
 * when the summonable butler can conduct the interview himself, the stages stay
 * and only the thing driving them changes.
 */

export type OnboardStage =
  /** the door: registry or this device, and the way out */
  | 'welcome'
  /** back from the OAuth redirect, waiting for the estate to come down */
  | 'registry'
  /** …it came down populated: this is a returning user, not a new one */
  | 'welcomeBack'
  /** the house presents itself — three beats, no questions */
  | 'intro'
  /** the butler takes the user's measure: what fills the week */
  | 'composition'
  /* --- the interview, which BUILDS the estate behind the panel --- */
  | 'work'
  | 'training'
  | 'study'
  | 'preset'
  /* --- the walk: one stop per wing, three beats at each --- */
  | 'walk-watch'
  | 'walk-grounds'
  | 'walk-study'
  | 'walk-ledger'
  | 'close'

/** what the user said fills their week — every key optional to answer */
export interface Composition {
  shift: boolean
  dayJob: boolean
  training: boolean
  study: boolean
  money: boolean
}

export const EMPTY_COMPOSITION: Composition = {
  shift: false,
  dayJob: false,
  training: false,
  study: false,
  money: false,
}

/** an unanswered measure asks everything — the safe default, never a gate */
const ASK_ALL: Composition = {
  shift: true,
  dayJob: true,
  training: true,
  study: true,
  money: true,
}

/**
 * The interview stages this run will actually hold, in order. The preset is
 * unconditional — a look is the one thing every household picks — and an
 * entirely unanswered composition asks everything rather than nothing:
 * skipping the measure must not skip the house.
 */
export function setupStages(c: Composition | null): OnboardStage[] {
  const comp = c === null || Object.values(c).every((v) => !v) ? ASK_ALL : c
  const stages: OnboardStage[] = []
  if (comp.shift || comp.dayJob) stages.push('work')
  if (comp.training) stages.push('training')
  if (comp.study) stages.push('study')
  stages.push('preset')
  return stages
}

/** the walk, in registry order, then the send-off */
const WALK_STAGES: OnboardStage[] = [
  'walk-watch',
  'walk-grounds',
  'walk-study',
  'walk-ledger',
]

const ALL_STAGES: OnboardStage[] = [
  'welcome',
  'registry',
  'welcomeBack',
  'intro',
  'composition',
  'work',
  'training',
  'study',
  'preset',
  ...WALK_STAGES,
  'close',
]

export function isStage(v: unknown): v is OnboardStage {
  return typeof v === 'string' && (ALL_STAGES as string[]).includes(v)
}

/** which wing a walk stop is standing in, if it is a walk stop */
export const WALK_WING: Partial<Record<OnboardStage, string>> = {
  'walk-watch': 'watch',
  'walk-grounds': 'training',
  'walk-study': 'study',
  'walk-ledger': 'capital',
}

/* ------------------------------------------------------------ resume */

const RESUME_KEY = 'majordomo-onboard'

interface ResumeRecord {
  stage: OnboardStage
  composition: Composition | null
}

function readResume(): ResumeRecord | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { stage?: unknown; composition?: unknown } | null
    if (!isStage(parsed?.stage)) return null
    const c = parsed?.composition as Partial<Composition> | null | undefined
    return {
      stage: parsed.stage,
      composition: c ? { ...EMPTY_COMPOSITION, ...c } : null,
    }
  } catch {
    // sessionStorage refused, or a hand-edited record — a run that cannot be
    // resumed simply starts again
    return null
  }
}

function writeResume(stage: OnboardStage, composition: Composition | null): void {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify({ v: 2, stage, composition }))
  } catch {
    // storage refused: the flow still works, it just won't survive the redirect
  }
}

function clearResume(): void {
  try {
    sessionStorage.removeItem(RESUME_KEY)
  } catch {
    /* nothing to clear */
  }
}

/* ------------------------------------------------------------- state */

interface OnboardState {
  /** null means the overlay renders nothing at all */
  stage: OnboardStage | null
  /** the measure's answers; null until the composition stage commits them */
  composition: Composition | null
  /** open the flow at a given stage */
  begin: (stage: OnboardStage) => void
  /** jump to a named stage (the welcome screen's branches, skip-the-rest) */
  go: (stage: OnboardStage) => void
  /** the composition stage committing its answers before moving on */
  setComposition: (c: Composition) => void
  /** the NEXT button: the following stage in this run's flow, or the end */
  advance: () => void
  /** done, declined, or waved off — the device is marked and the Manor opens */
  finish: () => void
}

export const useOnboarding = create<OnboardState>((set, get) => ({
  stage: null,
  composition: null,

  begin: (stage) => {
    writeResume(stage, get().composition)
    set({ stage })
  },

  go: (stage) => {
    writeResume(stage, get().composition)
    set({ stage })
  },

  setComposition: (composition) => {
    writeResume(get().stage ?? 'composition', composition)
    set({ composition })
  },

  advance: () => {
    const { stage, composition } = get()
    const flow: OnboardStage[] = [
      'intro',
      'composition',
      ...setupStages(composition),
      ...WALK_STAGES,
      'close',
    ]
    const i = stage ? flow.indexOf(stage) : -1
    const next = i >= 0 ? flow[i + 1] : flow[0]
    if (!next) {
      get().finish()
      return
    }
    writeResume(next, composition)
    set({ stage: next })
  },

  finish: () => {
    // whatever the walk dressed must not outlive it — belt and braces beside
    // the walk card's own sweep-on-leave
    sweepSample()
    // the flag is what stops the interview coming back — set it whether the
    // user answered every stage or waved the whole thing off at the door
    useShellStore.getState().setOnboarded(true)
    clearResume()
    set({ stage: null, composition: null })
    useNavStore.getState().requestView('manor')
  },
}))

/* ------------------------------------------------------------- entry */

/**
 * Does this device hold anything the user would recognise as theirs?
 *
 * The Watch's four starter SHAPES are excluded deliberately: they are seeded
 * state, present on every fresh device, and counting them would mean nobody
 * ever qualifies as new.
 */
export function estateEmpty(): boolean {
  return (
    useEventsStore.getState().events.length === 0 &&
    useWorkoutStore.getState().workouts.length === 0 &&
    useStudyStore.getState().subjects.length === 0
  )
}

/**
 * Where a re-run should start. Someone already signed in — or on a build with
 * no registry to sign in to — has nothing to decide at the door, so the
 * welcome screen would only be a stage to tap past. The intro still plays:
 * a re-run is asked for precisely to be shown the house again.
 */
export function entryStage(): OnboardStage {
  const signedIn = useAuthStore.getState().status === 'signedIn'
  return signedIn || offReason() !== null ? 'intro' : 'welcome'
}

let started = false

/**
 * Decide, once, whether a boot should open the setup. Called at module scope
 * from main.tsx beside initAuth/initSync — not from an effect, which StrictMode
 * double-invokes.
 *
 * In DEV the interview NEVER opens by itself: `?onboard[=stage]` opens it, the
 * same family as `?sheet=` / `?map=`. That is not only a screenshot aid — the
 * Manor harness drives a bare dev URL against a fresh estate and would
 * otherwise be met by a welcome screen instead of the grid it came to measure.
 * A run already in progress in THIS tab still resumes, because the OAuth
 * redirect returns to the bare origin and would otherwise abandon the flow
 * mid-sign-in; a fresh browser context has no such record, so the harness is
 * unaffected.
 */
export function initOnboarding(): void {
  if (started) return
  started = true

  // a tab that died mid-walk left its costume on — sweep before anything reads
  // the stores as truth (harmless when there is nothing to sweep)
  sweepSample()

  const resume = readResume()
  const resumeWith = (r: ResumeRecord) => {
    useOnboarding.setState({ composition: r.composition })
    useOnboarding.getState().begin(r.stage)
  }

  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('onboard')) {
      if (resume) resumeWith(resume)
      return
    }
    const asked = params.get('onboard')
    if (isStage(asked)) {
      if (resume?.composition) useOnboarding.setState({ composition: resume.composition })
      useOnboarding.getState().begin(asked)
    } else if (resume) {
      resumeWith(resume)
    } else {
      useOnboarding.getState().begin('welcome')
    }
    return
  }

  if (useShellStore.getState().onboarded) return

  // An estate arrived some other way — an import, a legacy blob, a device that
  // used the app before this flag existed. Nothing here is new, so mark it and
  // say nothing.
  if (!estateEmpty()) {
    useShellStore.getState().setOnboarded(true)
    return
  }

  if (resume) resumeWith(resume)
  else useOnboarding.getState().begin('welcome')
}

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__onboard = {
    store: useOnboarding,
    /** jump the flow to any stage without reloading */
    go: (stage: string) => {
      if (isStage(stage)) useOnboarding.getState().go(stage)
    },
    entryStage,
    estateEmpty,
    setupStages,
  }
}
