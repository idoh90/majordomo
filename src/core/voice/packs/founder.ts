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
  modules: {
    training: { name: 'TRAINING GROUNDS', tagline: 'Conditioning · strain · fuel' },
    capital: { name: 'WAYNE FUND', tagline: 'Net worth · markets · ledger' },
  },
  capital: {
    vaultEmpty:
      "No balances yet. Add your accounts, then log a snapshot to start charting the cave's worth.",
  },
  backup: {
    notExportFile: 'Not a Batman Project export file.',
  },
}
