import type { VoicePack } from '../types'

/** The Majordomo — the commercial voice. Dry, composed, quietly satisfied. */
export const majordomoPack: VoicePack = {
  appName: 'Majordomo',
  wordmark: { lead: 'MAJORDOMO', accent: '' },
  skinPickerBlurb: 'Three presets, one house. Switches instantly — nothing else changes.',
  modules: {
    training: { name: 'THE GROUNDS', tagline: 'Conditioning · strain · fuel' },
    capital: { name: 'THE LEDGER', tagline: 'Net worth · markets · budget' },
  },
  capital: {
    vaultEmpty:
      "No balances yet. Add your accounts, then log a snapshot to start charting the estate's worth.",
  },
  backup: {
    notExportFile: 'Not a Majordomo export file.',
  },
}
