import type { CalendarEvent } from '../../core/events/types'
import { useNavStore } from '../../core/store/nav'
import { voice } from '../../core/voice'
import { useStudyUi } from '../../modules/study/uiStore'
import { useWorkshopStore } from '../../modules/workshop/store'
import { useWorkshopUi } from '../../modules/workshop/uiStore'

/**
 * Where a marker chip LEADS.
 *
 * A chip is a projection of a record that lives in a wing — a homework's due
 * day, an exam's day, a milestone, a job's delivery deadline. The Manor cannot
 * correct or withdraw one, because the record is not the Manor's; the wing is
 * the only place with the sheet that can. So the chip's job is to be the door
 * to it, and a chip that is only a label leaves a wrongly-dated exam counting
 * down at a reader with nowhere to press.
 *
 * A source with no such door returns null and its chip stays the plain label
 * it has always been. That is the honest answer for Google's mirrored all-day
 * events (read-only by design, their editor is the other calendar) and for the
 * Ledger's payday, which projects from no record at all.
 */
export function markerHome(e: CalendarEvent): { hint: string; open: () => void } | null {
  const ref = e.sourceRef
  if (!ref) return null

  if (e.source === 'study') {
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

  if (e.source === 'workshop') {
    // a Workshop record is two hops away — the wing, then the venture's board
    // — so unlike the Study's the venture has to be RESOLVED here. Doing it
    // lazily inside open() keeps this out of every chip's render.
    const kind = ref.startsWith('ms:') ? 'milestone' : ref.startsWith('due:') ? 'card' : null
    if (!kind) return null
    const id = ref.slice(ref.indexOf(':') + 1)
    return {
      hint: voice.manor.eventSheet.openIn(voice.modules.workshop.name),
      open: () => {
        const ws = useWorkshopStore.getState()
        const ventureId =
          kind === 'milestone'
            ? ws.milestones.find((m) => m.id === id)?.ventureId
            : ws.cards.find((c) => c.id === id)?.ventureId
        // an archived venture has no board to open, and a request left
        // unclaimed would fire on whichever board opened next — so the chip
        // shows the wing and asks for nothing
        const venture = ws.ventures.find((v) => v.id === ventureId)
        if (venture && !venture.archived) {
          useWorkshopUi.getState().requestRecord({ ventureId: venture.id, kind, id })
        }
        useNavStore.getState().requestView('workshop')
      },
    }
  }

  return null
}
