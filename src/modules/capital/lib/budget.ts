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

export function daysInMonthOf(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/* ---- fixed vs variable ------------------------------------------------------
 * The month's spend is two different KINDS of money and they do not behave
 * alike in time. Recurring expenses are FIXED: rent is committed the instant
 * the month opens, in full, and no amount of care this week makes it smaller.
 * The card total and one-off items are VARIABLE: they accrue day by day and
 * are the only part a run rate can honestly describe.
 *
 * Adding the two and dividing by the day elapsed — which everything used to do
 * — books rent as if it were spent on the 1st: on day 5 of a month carrying
 * ₪4,000 of rent the burn rate read ₪986 a day against ₪339 last month, an
 * artifact of the denominator that decayed away as the month wore on. Rates
 * and pace comparisons therefore run through `spendPace` below; the headline
 * TOTAL is untouched, because money already committed is genuinely gone. */
export interface SpendBreakdown {
  /** Σ active recurring — committed the moment the month opens */
  fixed: number
  /** card snapshot + this month's one-offs — what actually accrues day by day */
  variable: number
  /** fixed + variable: the month's full commitment, what monthlySpent returns */
  total: number
}

export function spendBreakdown(
  month: string,
  spends: Record<string, number>,
  recurring: RecurringExpense[],
  items: SpendItem[],
): SpendBreakdown {
  const fixed = activeRecurringTotal(recurring)
  const variable =
    (spends[month] ?? 0) + itemsForMonth(items, month).reduce((s, i) => s + i.amount, 0)
  return { fixed, variable, total: fixed + variable }
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
  return spendBreakdown(month, spends, recurring, items).total
}

/**
 * What a day of this month actually costs: the fixed side spread flat across
 * every day it buys, plus the variable side over the days actually elapsed.
 * Hand a finished month `dayOfMonth === daysInMonth` and it collapses to
 * total/days — so this month and last month are the same quantity, comparable.
 */
export function dailyBurn(b: SpendBreakdown, dayOfMonth: number, daysInMonth: number): number {
  const days = Math.max(1, daysInMonth)
  return b.fixed / days + b.variable / Math.min(days, Math.max(1, dayOfMonth))
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

export interface SpendPace {
  fixed: number
  variable: number
  total: number
  budget: number
  dayOfMonth: number
  daysInMonth: number
  /** how far through the month we are, 0..1 */
  dayFraction: number
  /** the share of the budget fixed costs claim before the month even starts */
  fixedFraction: number
  /** total / budget — where the bar actually sits (unclamped; callers clamp) */
  usedFraction: number
  /** where the bar OUGHT to sit today: ALL of fixed, plus the elapsed share of
   *  whatever the budget leaves for variable spending */
  expectedFraction: number
  /** what remains of the budget for variable spending once fixed is taken out */
  variableBudget: number
  /** the honest daily figure — see dailyBurn */
  perDay: number
  underPace: boolean
}

export function spendPace(b: SpendBreakdown, budget: number, now: Date): SpendPace {
  const dayOfMonth = now.getDate()
  const daysInMonth = daysInMonthOf(now)
  const dayFraction = dayOfMonth / daysInMonth
  const variableBudget = Math.max(0, budget - b.fixed)
  // with no recurring at all this is exactly dayFraction — the old comparison,
  // unchanged for anyone who never itemized a fixed cost
  const expectedFraction =
    budget > 0 ? clamp01((Math.max(0, b.fixed) + variableBudget * dayFraction) / budget) : 0
  const usedFraction = budget > 0 ? b.total / budget : 0

  return {
    ...b,
    budget,
    dayOfMonth,
    daysInMonth,
    dayFraction,
    fixedFraction: budget > 0 ? clamp01(b.fixed / budget) : 0,
    usedFraction,
    expectedFraction,
    variableBudget,
    perDay: dailyBurn(b, dayOfMonth, daysInMonth),
    underPace: budget > 0 && usedFraction <= expectedFraction,
  }
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
