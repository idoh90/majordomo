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
    briefing: (count) => {
      if (count === 0) return 'No watches this week, sir. The estate is yours.'
      if (count === 1) return 'A single watch this week, sir. A comparatively civilised stretch.'
      const words = ['', '', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven']
      return `${words[count] ?? count} watches this week, sir.`
    },
    briefingStat: ({ watchH, trainingCount, studyH }) => {
      const parts: string[] = []
      if (watchH > 0) parts.push(`${watchH.toFixed(1)} h watch`)
      if (trainingCount > 0) parts.push(`${trainingCount} training`)
      if (studyH > 0) parts.push(`${studyH.toFixed(0)} h study`)
      return parts.join(' · ')
    },
  },
  kinds: {
    shift: 'THE WATCH',
    sleep: 'REST',
    training: 'THE GROUNDS',
    study: 'THE STUDY',
    marker: 'THE LEDGER',
  },
  modules: {
    watch: { name: 'THE WATCH', tagline: 'Shifts · duty · the roster' },
    training: { name: 'THE GROUNDS', tagline: 'Conditioning · strain · fuel' },
    capital: { name: 'THE LEDGER', tagline: 'Net worth · markets · budget' },
  },
  watch: {
    onDuty: 'ON DUTY · THIS WEEK',
    nextWatch: 'NEXT WATCH',
    noneAhead: 'No watch posted, sir.',
    post: 'POST A WATCH',
    weekList: "THIS WEEK'S WATCHES",
    dayShift: 'Day',
    nightShift: 'Night',
    duplicate: 'There is already a watch that day, sir.',
    posted: 'On the books, sir.',
    postedWithSleep: 'On the books, sir — sleep is pencilled for the morning after.',
    note: 'Every watch posted here takes its place in the Manor at once, sir.',
    openManor: 'Open the Manor →',
    status: { logged: 'LOGGED', next: 'NEXT', ahead: 'AHEAD' },
  },
  capital: {
    vaultEmpty:
      "No balances yet. Add your accounts, then log a snapshot to start charting the estate's worth.",
  },
  backup: {
    notExportFile: 'Not a Majordomo export file.',
  },
}
