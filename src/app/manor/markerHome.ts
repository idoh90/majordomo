import type { CalendarEvent } from '../../core/events/types'
import { useNavStore } from '../../core/store/nav'
import { voice } from '../../core/voice'
import { useStudyUi } from '../../modules/study/uiStore'

/**
 * Where a marker chip LEADS.
 *
 * A chip is a projection of a record that lives in a wing — a homework's due
 * day, an exam's day. The Manor cannot correct or withdraw one, because the
 * record is not the Manor's; the wing is the only place with the sheet that
 * can. So the chip's job is to be the door to it, and a chip that is only a
 * label leaves a wrongly-dated exam counting down at a reader with nowhere
 * to press.
 *
 * A source with no such door returns null and its chip stays the plain label
 * it has always been. That is the honest answer for Google's mirrored all-day
 * events (read-only by design, their editor is the other calendar) and for
 * the Ledger's payday, which projects from no record at all. The Workshop's
 * milestone and delivery chips are the next ones that belong here.
 */
export function markerHome(e: CalendarEvent): { hint: string; open: () => void } | null {
  const ref = e.sourceRef
  if (e.source !== 'study' || !ref) return null
  if (!ref.startsWith('hw:') && !ref.startsWith('exam:')) return null
  return {
    hint: voice.manor.eventSheet.openIn(voice.modules.study.name),
    open: () => {
      // fill the mailbox BEFORE the view changes: the wing reads it as it
      // mounts, and an empty box on mount is a chip that opened nothing
      useStudyUi.getState().requestRecord(ref)
      useNavStore.getState().requestView('study')
    },
  }
}
