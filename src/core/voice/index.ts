import { FOUNDER } from '../founder'
import { founderPack } from './packs/founder'
import { majordomoPack } from './packs/majordomo'

export type { VoicePack } from './types'

/**
 * The app's script. Selected once at boot — FOUNDER is a build-time constant,
 * so the unused pack (and every string in it) tree-shakes out of commercial
 * bundles. Later: locale/persona switching swaps the selection mechanism
 * behind the same VoicePack contract.
 */
export const voice = FOUNDER ? founderPack : majordomoPack
