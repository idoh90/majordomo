import { useMemo } from 'react'
import { useShellStore } from '../core/store/shell'
import type { ConsoleModule } from '../core/module'
import { CONSOLES } from './consoles'

/**
 * THE RUNNING ORDER — which wings the navs list, and in what order.
 *
 * `consoles.ts` is still the registry: it decides what a wing IS and what the
 * house's own opening order is. This decides what one household has since done
 * with that order, and it is the only thing either nav reads.
 *
 * Two rules, and both exist because the registry outlives the preference:
 *
 * 1. An id in the saved order that this build does not know is dropped, so a
 *    wing removed from the registry cannot leave a dead tab behind.
 * 2. A registered wing the saved order never mentions is APPENDED, so a wing
 *    added in a later release appears at the end of the navs rather than
 *    silently never appearing at all. That is the whole reason the preference
 *    is a list of ids and not a list of positions.
 *
 * Hiding is not deleting, and nothing below touches the wing itself: its store,
 * its Upkeep pass (which the Manor still mounts for every registered wing) and
 * its briefing facts carry on exactly as before. The wing is off the navs, and
 * that is all it is.
 */
export interface Wings {
  /** every registered wing, in the household's order — the settings list */
  all: ConsoleModule[]
  /** the ones the navs actually show, in the same order */
  visible: ConsoleModule[]
}

export function resolveWings(order: string[], off: string[]): Wings {
  const byId = new Map(CONSOLES.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const all: ConsoleModule[] = []

  for (const id of order) {
    const c = byId.get(id)
    if (!c || seen.has(id)) continue // unknown, or listed twice by a bad blob
    seen.add(id)
    all.push(c)
  }
  for (const c of CONSOLES) if (!seen.has(c.id)) all.push(c)

  const hidden = new Set(off)
  return { all, visible: all.filter((c) => !hidden.has(c.id)) }
}

/**
 * The hook both navs and the settings list read.
 *
 * The two arrays are selected RAW and joined in a memo on purpose: a selector
 * that built the list itself would return a new array on every store touch and
 * re-render the whole shell (and, in a wing that filtered inside one, blank the
 * screen — the lesson that made this a rule).
 */
export function useWings(): Wings {
  const order = useShellStore((s) => s.wingOrder)
  const off = useShellStore((s) => s.wingsOff)
  return useMemo(() => resolveWings(order, off), [order, off])
}

/**
 * Move a wing one place along the household's order and persist the WHOLE
 * resolved order — never the sparse saved one. Nudging the last wing up when
 * nothing has ever been reordered has to write all five ids, or the four it
 * left out would be re-appended in registry order and undo the move.
 */
export function nudgeWing(id: string, dir: -1 | 1) {
  const { wingOrder, wingsOff, setWingOrder } = useShellStore.getState()
  const all = resolveWings(wingOrder, wingsOff).all.map((c) => c.id)
  const i = all.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= all.length) return
  ;[all[i], all[j]] = [all[j], all[i]]
  setWingOrder(all)
}
