import type { VoicePack } from '../types'

/** The Majordomo — the commercial voice. Dry, composed, quietly satisfied. */
export const majordomoPack: VoicePack = {
  appName: 'Majordomo',
  wordmark: { lead: 'MAJORDOMO', accent: '' },
  skinPickerBlurb: 'Three presets, one house. Switches instantly — nothing else changes.',
  storageWarning: "Browser storage is blocked (private mode?) — nothing will survive a reload.",
  presetLabel: 'PRESET',
  manor: {
    name: 'THE MANOR',
    empty: 'Nothing on the books, sir. A rare quiet evening.',
    crossesMidnight: 'Crosses midnight — one block, as it should be.',
    monthNote: 'A night watch is written on the day it begins, sir; the small hours carry a reminder.',
  },
  kinds: {
    shift: 'THE WATCH',
    sleep: 'REST',
    training: 'THE GROUNDS',
    study: 'THE STUDY',
    marker: 'THE LEDGER',
  },
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
