import { useEventsStore } from '../../../core/events/store'
import { useNow } from '../../../core/useNow'
import type { BriefFacts } from '../../../core/voice/types'
import { useLedgerBriefingFacts } from '../../../modules/capital/Briefing'
import { useCapitalStore } from '../../../modules/capital/store'
import { monthKey, monthlySpent } from '../../../modules/capital/lib/budget'
import { latestSnapshot } from '../../../modules/capital/lib/networth'
import { useStudyBriefingFacts } from '../../../modules/study/Briefing'
import { useStudyStore } from '../../../modules/study/store'
import { useGroundsBriefingFacts } from '../../../modules/training/Briefing'
import { useWatchBriefingFacts } from '../../../modules/watch/Briefing'
import { useWorkshopBriefingFacts } from '../../../modules/workshop/Briefing'
import { useWorkshopStore } from '../../../modules/workshop/store'

/**
 * Every wing's figures, gathered once for the written brief.
 *
 * The wings each own their own derivation and always did — this calls the same
 * hooks their own briefing panels call, so a sentence on the Manor and a panel
 * on a wing can never quote two different numbers for one week.
 *
 * A wing reads `null` when it has nothing on file, using exactly the gates its
 * briefing row used to apply before the brief replaced it: no subjects, no
 * ventures, no money. The Watch and the Grounds are never gated — they were
 * not before, and "nothing logged this week" is itself worth saying.
 *
 * Hooks are called unconditionally, gates applied after. React requires the
 * first; the second is only which sentences get written.
 */
export function useBriefFacts(): BriefFacts {
  const now = useNow()
  const events = useEventsStore((s) => s.events)

  const watch = useWatchBriefingFacts()
  const grounds = useGroundsBriefingFacts()
  const study = useStudyBriefingFacts()
  const workshop = useWorkshopBriefingFacts()
  const ledger = useLedgerBriefingFacts()

  const subjects = useStudyStore((s) => s.subjects)
  const ventures = useWorkshopStore((s) => s.ventures)
  const snapshots = useCapitalStore((s) => s.snapshots)
  const holdings = useCapitalStore((s) => s.holdings)
  const spends = useCapitalStore((s) => s.spends)
  const spendItems = useCapitalStore((s) => s.spendItems)
  const recurring = useCapitalStore((s) => s.recurring)
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)

  const spent = monthlySpent(monthKey(new Date(now)), spends, recurring, spendItems)
  const hasMoney =
    monthlyBudget > 0 || spent > 0 || latestSnapshot(snapshots) != null || holdings.length > 0

  // the Watch speaks only once a shift has existed at some point — an estate
  // that has never posted one is not "0.0 of 0.0 hours", it simply has no watch
  const hasShifts = events.some((e) => e.kind === 'shift')

  return {
    watch: hasShifts ? watch : null,
    grounds,
    study: subjects.some((s) => !s.archived) ? study : null,
    workshop: ventures.some((v) => !v.archived) ? workshop : null,
    ledger: hasMoney ? ledger : null,
    hour: new Date(now).getHours(),
  }
}
