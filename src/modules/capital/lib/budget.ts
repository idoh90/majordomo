// The mini-budget, paced against a monthly target. Month-to-date spend is either
// a quick single total the user overwrites from their card app, OR — once they
// itemize — the sum of active recurring expenses + this month's one-off items.

import type { RecurringExpense, SpendItem } from '../types'

/** Local-time 'YYYY-MM' bucket. Never derive months from toISOString() (UTC shift). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long' })
}

/** 'YYYY-MM' → its first day, local time (the inverse of monthKey). */
export function monthStart(month: string): Date {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1)
}

/** Walk the month pager: shiftMonth('2026-01', -1) === '2025-12'. */
export function shiftMonth(month: string, delta: number): string {
  const d = monthStart(month)
  d.setMonth(d.getMonth() + delta)
  return monthKey(d)
}

/** Label a month key — bare month name inside `now`'s year, 'December 2025' before it. */
export function monthKeyLabel(month: string, now: Date): string {
  const d = monthStart(month)
  return d.getFullYear() === now.getFullYear() ? monthLabel(d) : `${monthLabel(d)} ${d.getFullYear()}`
}

/** A date to stamp a new one-off with while viewing `month`: now when that IS
 *  the current month, else the 1st — so the item lands in the month on screen. */
export function dateInMonth(month: string, now: Date): string {
  return (monthKey(now) === month ? now : monthStart(month)).toISOString()
}

export function itemsForMonth(items: SpendItem[], month: string): SpendItem[] {
  return items.filter((i) => monthKey(new Date(i.date)) === month)
}

export function activeRecurringTotal(recurring: RecurringExpense[]): number {
  return recurring.filter((r) => r.active).reduce((s, r) => s + r.amount, 0)
}

/**
 * Month-to-date spend for `month` — additive: the card-spend snapshot (the
 * running total in `spends`, overwritten whenever the user checks their card
 * app) + Σ active recurring expenses + Σ this month's one-off items.
 */
export function monthlySpent(
  month: string,
  spends: Record<string, number>,
  recurring: RecurringExpense[],
  items: SpendItem[],
): number {
  return (
    (spends[month] ?? 0) +
    activeRecurringTotal(recurring) +
    itemsForMonth(items, month).reduce((s, i) => s + i.amount, 0)
  )
}

/*
 * RETIRED 2026-07-12 (kept for a possible return): the "on pace for" projection
 * read as unrealistic — naive linear `spent/day × daysInMonth` scales FIXED
 * costs with time (rent booked day 1 projected ×2.5). If this comes back,
 * project only the variable part: recurring + (variable spent / day) × days.
 */
export interface BudgetPace {
  spent: number
  budget: number
  /** fraction of budget already spent (can exceed 1) */
  usedFraction: number
  dayOfMonth: number
  daysInMonth: number
  /** linear month-end projection from the current run rate */
  projected: number
  /** projected − budget; positive = heading over */
  projectedOver: number
  status: 'no-budget' | 'under' | 'on-track' | 'over'
}

export function budgetPace(spent: number, budget: number, now: Date): BudgetPace {
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projected = dayOfMonth > 0 ? (spent / dayOfMonth) * daysInMonth : spent
  const projectedOver = projected - budget

  let status: BudgetPace['status']
  if (budget <= 0) status = 'no-budget'
  else if (spent > budget) status = 'over'
  // >5% projected overshoot with the month underway = trending over
  else if (projectedOver > budget * 0.05) status = 'over'
  else if (projected < budget * 0.95) status = 'under'
  else status = 'on-track'

  return {
    spent,
    budget,
    usedFraction: budget > 0 ? spent / budget : 0,
    dayOfMonth,
    daysInMonth,
    projected,
    projectedOver,
    status,
  }
}
