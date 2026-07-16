import type { VoicePack } from '../types'
import { majordomoPack } from './majordomo'

/**
 * The founder pack — the original Batman-era strings, alive only behind
 * VITE_FOUNDER_SKIN. Never referenced in commercial builds, so the whole
 * module (and every string in it) tree-shakes away.
 */
export const founderPack: VoicePack = {
  ...majordomoPack,
  appName: 'The Batman Project',
  wordmark: { lead: 'The Batman', accent: 'Project' },
  skinPickerBlurb: 'Ten looks for the same cave. Switches instantly — nothing else changes.',
  manor: {
    ...majordomoPack.manor,
    name: 'THE CAVE',
  },
  modules: {
    watch: { name: 'THE NIGHT SHIFT', tagline: 'Shifts · duty · the roster' },
    training: { name: 'TRAINING GROUNDS', tagline: 'Conditioning · strain · fuel' },
    study: { name: 'THE ACADEMY', tagline: 'Subjects · syllabi · the docket' },
    capital: { name: 'WAYNE FUND', tagline: 'Net worth · markets · ledger' },
  },
  capital: {
    ...majordomoPack.capital,
    vaultEmpty:
      "No balances yet. Add your accounts, then log a snapshot to start charting the cave's worth.",
  },
  backup: {
    ...majordomoPack.backup,
    notExportFile: 'Not a Batman Project export file.',
  },
}
