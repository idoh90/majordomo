import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { localDayKey } from '../../../core/dates'
import { makeId } from '../../../core/ids'
import { voice } from '../../../core/voice'
import { useCapitalStore } from '../store'
import type { RecurringExpense, SpendItem } from '../types'
import { dateInMonth, itemsForMonth, monthKey, monthKeyLabel, monthStart, shiftMonth } from '../lib/budget'
import { formatILS } from '../lib/money'

interface SpendSheetProps {
  open: boolean
  now: number
  onClose: () => void
}

interface RecDraft {
  id: string
  name: string
  amount: string
  active: boolean
}
interface ItemDraft {
  id: string
  name: string
  amount: string
  date: string
}
/** the per-month part of the sheet: card snapshot + that month's one-offs */
interface MonthDraft {
  quick: string
  items: ItemDraft[]
}

/* ---- what a typed row means ------------------------------------------------
 * Amounts are SIGNED: a minus on a one-off row is a refund and subtracts all
 * the way through (month total, card, tile, briefing). Rows are never dropped
 * for want of an amount — a row with a name but no usable amount BLOCKS Save
 * with a marker on the row, because silently filtering it away is how a spend
 * you thought you logged disappears. Only an untouched blank row (nothing typed
 * at all — the '+ Add' that changed its mind) is dropped. */
const signed = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
const isBlankRow = (r: { name: string; amount: string }) => !r.name.trim() && !r.amount.trim()
const isIncompleteRow = (r: { name: string; amount: string }) => !isBlankRow(r) && signed(r.amount) === 0

/** Manage spending month by month: a monthly budget, a quick typed card total
 *  and one-off items for the VIEWED month (‹ July ›, opening on the current
 *  one), plus recurring expenses — which are global, not per-month data. */
export function SpendSheet({ open, now, onClose }: SpendSheetProps) {
  const monthlyBudget = useCapitalStore((s) => s.monthlyBudget)
  const spends = useCapitalStore((s) => s.spends)
  const storeRecurring = useCapitalStore((s) => s.recurring)
  const storeItems = useCapitalStore((s) => s.spendItems)
  const setMonthlyBudget = useCapitalStore((s) => s.setMonthlyBudget)
  const setSpend = useCapitalStore((s) => s.setSpend)
  const setRecurring = useCapitalStore((s) => s.setRecurring)
  const setMonthItems = useCapitalStore((s) => s.setMonthItems)

  const nowDate = new Date(now)
  const thisMonth = monthKey(nowDate)

  const [month, setMonth] = useState(thisMonth)
  const [budget, setBudget] = useState('')
  const [rec, setRec] = useState<RecDraft[]>([])
  // one draft per month visited, so paging away and back keeps unsaved edits
  const [drafts, setDrafts] = useState<Record<string, MonthDraft>>({})
  // row markers stay quiet until a Save actually bounces — nagging while the
  // user is still typing the row is worse than the problem
  const [showProblems, setShowProblems] = useState(false)

  // fresh open = fresh drafts from the store, back on the current month. Keyed
  // on `open` alone on purpose: re-seeding on every store write would wipe the
  // draft the user is typing (including in the months they aren't looking at).
  useEffect(() => {
    if (!open) return
    setMonth(thisMonth)
    setBudget(monthlyBudget ? String(monthlyBudget) : '')
    setRec(storeRecurring.map((r) => ({ id: r.id, name: r.name, amount: String(r.amount), active: r.active })))
    setDrafts({})
    setShowProblems(false)
  }, [open])

  // seed the viewed month the first time it's shown (never after — that would
  // overwrite the user's draft on every store write)
  useEffect(() => {
    if (!open) return
    setDrafts((d) =>
      d[month]
        ? d
        : {
            ...d,
            [month]: {
              quick: spends[month] != null ? String(spends[month]) : '',
              items: itemsForMonth(storeItems, month).map((i) => ({
                id: i.id,
                name: i.name,
                amount: String(i.amount),
                date: i.date,
              })),
            },
          },
    )
  }, [open, month, spends, storeItems])

  const draft = drafts[month] ?? { quick: '', items: [] }
  const patch = (fn: (d: MonthDraft) => MonthDraft) =>
    setDrafts((d) => ({ ...d, [month]: fn(d[month] ?? { quick: '', items: [] }) }))
  const setQuick = (quick: string) => patch((d) => ({ ...d, quick }))
  const setItems = (fn: (items: ItemDraft[]) => ItemDraft[]) => patch((d) => ({ ...d, items: fn(d.items) }))

  const recTotal = rec.filter((r) => r.active).reduce((s, r) => s + signed(r.amount), 0)
  const itemsTotal = draft.items.reduce((s, i) => s + signed(i.amount), 0)
  // additive, and identical to monthlySpent(): card snapshot + recurring + one-offs
  const spent = signed(draft.quick) + recTotal + itemsTotal
  // a negative budget/card total is refused below rather than clamped to 0 —
  // clamping is the same silent rewrite this slice is here to remove
  const budgetNum = signed(budget)
  const over = budgetNum > 0 && spent > budgetNum

  const label = monthKeyLabel(month, nowDate)
  // forward stops at the present — or at the last month that holds data, so a
  // future-dated item can never end up unreachable
  const lastMonth = useMemo(() => {
    const keys = [thisMonth, ...Object.keys(spends), ...storeItems.map((i) => monthKey(new Date(i.date)))]
    return keys.sort().pop() ?? thisMonth // 'YYYY-MM' sorts chronologically
  }, [thisMonth, spends, storeItems])

  /* ---- what Save would write, and what stands in its way ---- */

  const cleanRec = (rows: RecDraft[]): RecurringExpense[] =>
    rows
      .filter((r) => !isBlankRow(r))
      .map((r) => ({ id: r.id, name: r.name.trim() || 'Expense', amount: signed(r.amount), active: r.active }))
  const cleanItems = (rows: ItemDraft[]): SpendItem[] =>
    rows
      .filter((i) => !isBlankRow(i))
      .map((i) => ({ id: i.id, name: i.name.trim() || 'Item', amount: signed(i.amount), date: i.date }))

  const problems = useMemo(() => {
    const badRec = rec.filter(isIncompleteRow).map((r) => r.id)
    const badItems: Record<string, string[]> = {}
    const badQuick: string[] = []
    for (const [mk, d] of Object.entries(drafts)) {
      const bad = d.items.filter(isIncompleteRow).map((i) => i.id)
      if (bad.length) badItems[mk] = bad
      if (signed(d.quick) < 0) badQuick.push(mk)
    }
    const badBudget = signed(budget) < 0
    const count = badRec.length + Object.values(badItems).reduce((s, ids) => s + ids.length, 0)
    // recurring and the budget are global (always on screen); a bad row in
    // another month needs the pager moved before its marker means anything
    const firstMonth =
      badRec.length || badBudget ? undefined : Object.keys(badItems).concat(badQuick).sort()[0]
    return {
      badRec,
      badItems,
      badQuick,
      badBudget,
      count,
      firstMonth,
      blocked: count > 0 || badQuick.length > 0 || badBudget,
    }
  }, [rec, drafts, budget])

  const changed = useMemo(() => {
    const sameItems = (a: SpendItem[], b: SpendItem[]) =>
      a.length === b.length &&
      a.every((x, i) => x.id === b[i].id && x.name === b[i].name && x.amount === b[i].amount && x.date === b[i].date)
    const recNow = cleanRec(rec)
    const recChanged =
      recNow.length !== storeRecurring.length ||
      recNow.some((r, i) => {
        const s = storeRecurring[i]
        return r.id !== s.id || r.name !== s.name || r.amount !== s.amount || r.active !== s.active
      })
    const months = Object.entries(drafts)
      .filter(
        ([mk, d]) =>
          signed(d.quick) !== (spends[mk] ?? 0) || !sameItems(cleanItems(d.items), itemsForMonth(storeItems, mk)),
      )
      .map(([mk]) => mk)
    return { recChanged, budgetChanged: budgetNum !== monthlyBudget, months }
  }, [rec, drafts, budgetNum, monthlyBudget, storeRecurring, storeItems, spends])

  // "dirty" for the discard guard: anything the store doesn't have yet, INCLUDING
  // a half-typed row that Save would currently refuse
  const isDirty = changed.recChanged || changed.budgetChanged || changed.months.length > 0 || problems.blocked

  const save = () => {
    if (problems.blocked) {
      setShowProblems(true)
      // take the user to the offending month; a marker they can't see is no help
      if (problems.firstMonth && problems.firstMonth !== month) setMonth(problems.firstMonth)
      return
    }
    if (changed.budgetChanged) setMonthlyBudget(budgetNum)
    if (changed.recChanged) setRecurring(cleanRec(rec))
    // every month whose draft actually differs — paging to look writes nothing
    for (const mk of changed.months) {
      const d = drafts[mk]
      if (!d) continue
      setMonthItems(mk, cleanItems(d.items))
      setSpend(mk, signed(d.quick))
    }
    onClose()
  }

  const quickNegative = showProblems && problems.badQuick.includes(month)
  const budgetNegative = showProblems && problems.badBudget

  return (
    <Sheet open={open} onClose={onClose} dirty={isDirty}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-xl font-bold tracking-wide">Spending</h2>
        <div className="flex items-center gap-1">
          <PagerArrow
            dir="prev"
            label={voice.capital.spend.prevMonth}
            onClick={() => setMonth(shiftMonth(month, -1))}
          />
          <span className="min-w-[7.5rem] text-center font-display text-sm font-bold uppercase tracking-[0.12em] text-ink">
            {label}
          </span>
          <PagerArrow
            dir="next"
            label={voice.capital.spend.nextMonth}
            disabled={month >= lastMonth}
            onClick={() => setMonth(shiftMonth(month, 1))}
          />
        </div>
      </div>
      <p className="mb-4 text-sm text-ink-dim">
        Card spend + recurring + one-offs add up to the month's total.
      </p>

      <FieldRow>
        <Field label="Monthly budget" value={budget} onChange={setBudget} min={0} invalid={budgetNegative} />
        <Field label="Card spending" value={draft.quick} onChange={setQuick} min={0} invalid={quickNegative} />
      </FieldRow>
      <p className={`mt-1 text-[11px] ${quickNegative || budgetNegative ? 'text-danger' : 'text-ink-faint'}`}>
        {quickNegative || budgetNegative
          ? voice.capital.spend.noMinus
          : 'Card spending: overwrite whenever you check your card app — a running snapshot, not a log.'}
      </p>

      <Section
        title="Recurring monthly"
        hint={voice.capital.spend.recurringHint}
        onAdd={() => setRec((r) => [...r, { id: makeId(), name: '', amount: '', active: true }])}
      >
        {rec.map((r) => (
          <LineRow
            key={r.id}
            name={r.name}
            amount={r.amount}
            missingAmount={showProblems && problems.badRec.includes(r.id)}
            onName={(v) => setRec((rows) => rows.map((x) => (x.id === r.id ? { ...x, name: v } : x)))}
            onAmount={(v) => setRec((rows) => rows.map((x) => (x.id === r.id ? { ...x, amount: v } : x)))}
            onRemove={() => setRec((rows) => rows.filter((x) => x.id !== r.id))}
            active={r.active}
            onToggle={() => setRec((rows) => rows.map((x) => (x.id === r.id ? { ...x, active: !x.active } : x)))}
          />
        ))}
      </Section>

      <Section
        title={voice.capital.spend.oneOffs(label)}
        hint={voice.capital.spend.oneOffsHint}
        onAdd={() =>
          setItems((i) => [...i, { id: makeId(), name: '', amount: '', date: dateInMonth(month, nowDate) }])
        }
      >
        {draft.items.map((i) => (
          <LineRow
            key={i.id}
            name={i.name}
            amount={i.amount}
            missingAmount={showProblems && (problems.badItems[month] ?? []).includes(i.id)}
            date={i.date}
            month={month}
            onDate={(v) => setItems((rows) => rows.map((x) => (x.id === i.id ? { ...x, date: v } : x)))}
            onName={(v) => setItems((rows) => rows.map((x) => (x.id === i.id ? { ...x, name: v } : x)))}
            onAmount={(v) => setItems((rows) => rows.map((x) => (x.id === i.id ? { ...x, amount: v } : x)))}
            onRemove={() => setItems((rows) => rows.filter((x) => x.id !== i.id))}
          />
        ))}
      </Section>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <span className="text-sm text-ink-dim">{voice.capital.spend.total(label)}</span>
        <span className="stat-num text-2xl text-ink">{formatILS(spent)}</span>
      </div>
      {budgetNum > 0 && (
        <div className="mt-1 text-right text-xs">
          <span className={over ? 'text-danger' : 'text-ink-dim'}>
            {over ? `${formatILS(spent - budgetNum)} over budget` : `${formatILS(budgetNum - spent)} left`}
          </span>
        </div>
      )}

      {showProblems && problems.count > 0 && (
        <p className="mt-4 text-[12px] leading-relaxed text-danger">{voice.capital.spend.fixRows(problems.count)}</p>
      )}
      <button type="button" onClick={save} className="btn-cta mt-4 w-full py-3 text-base">
        Save
      </button>
    </Sheet>
  )
}

function PagerArrow({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: 'prev' | 'next'
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="chip rounded-pill border border-line bg-panel px-2.5 py-1 text-base leading-none text-ink-dim transition-colors hover:text-ink disabled:opacity-30 disabled:hover:text-ink-dim"
    >
      <span aria-hidden>{dir === 'prev' ? '‹' : '›'}</span>
    </button>
  )
}

function Section({
  title,
  hint,
  onAdd,
  children,
}: {
  title: string
  hint: string
  onAdd: () => void
  children: ReactNode
}) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">{title}</h3>
        <button type="button" onClick={onAdd} className="text-sm text-accent transition-opacity hover:opacity-80">
          + Add
        </button>
      </div>
      <p className="mb-2 text-[11px] text-ink-faint">{hint}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  )
}

function LineRow({
  name,
  amount,
  missingAmount,
  date,
  month,
  onDate,
  onName,
  onAmount,
  onRemove,
  active,
  onToggle,
}: {
  name: string
  amount: string
  /** Save bounced off this row: it has a name but no amount */
  missingAmount?: boolean
  /** one-off rows only — recurring has no date */
  date?: string
  month?: string
  onDate?: (iso: string) => void
  onName: (v: string) => void
  onAmount: (v: string) => void
  onRemove: () => void
  active?: boolean
  onToggle?: () => void
}) {
  const dimmed = active === false
  return (
    <div className={dimmed ? 'opacity-45' : ''}>
      <div className="flex items-center gap-2">
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={active}
            aria-label={active ? 'Pause' : 'Resume'}
            className={`h-4 w-4 shrink-0 rounded-full border transition-colors ${
              active ? 'border-accent bg-accent' : 'border-line'
            }`}
          />
        )}
        <input
          type="text"
          value={name}
          placeholder="name"
          onChange={(e) => onName(e.target.value)}
          className="card min-w-0 flex-1 px-2.5 py-2 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-accent/60"
        />
        {date != null && month != null && onDate != null && (
          <DateCell date={date} month={month} onDate={onDate} />
        )}
        {/* a dated row gives the amount box 16px back to the name — at 390px the
            name is the field that runs out of room first */}
        <div className={`relative shrink-0 ${date != null ? 'w-20' : 'w-24'}`}>
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-ink-faint">₪</span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmount(e.target.value)}
            className={`card w-full py-2 pl-5 pr-2 text-right font-display text-sm font-bold text-ink outline-none focus:border-accent/60 ${
              missingAmount ? 'border-danger' : ''
            }`}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove"
          className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-panel-2 hover:text-danger"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {missingAmount && (
        <p className="mt-0.5 pl-1 text-right text-[10.5px] text-danger">{voice.capital.spend.amountMissing}</p>
      )}
    </div>
  )
}

/** Compact day picker, clamped to the month on screen (the pager owns the month,
 *  so only the day is in play here — that's what "yesterday's fuel" needs). */
function DateCell({ date, month, onDate }: { date: string; month: string; onDate: (iso: string) => void }) {
  const first = monthStart(month)
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const min = localDayKey(first)
  const max = localDayKey(new Date(first.getFullYear(), first.getMonth(), lastDay))
  return (
    <input
      type="date"
      aria-label={voice.capital.spend.dateLabel}
      value={localDayKey(date)}
      min={min}
      max={max}
      onChange={(e) => {
        const d = Number(e.target.value.split('-')[2])
        if (!d) return
        // The PAGER owns the year and month — only the day is in play here.
        // Taking them from the input let a mistyped year move the row out of
        // the month the sheet was still showing it under: the total said one
        // thing before Save and another after, and the spend turned up in a
        // month the pager would not have offered.
        // The original time of day is kept so same-date items hold their order.
        const prev = new Date(date)
        const day = Math.min(Math.max(d, 1), lastDay)
        onDate(
          new Date(
            first.getFullYear(),
            first.getMonth(),
            day,
            prev.getHours(),
            prev.getMinutes(),
            prev.getSeconds(),
          ).toISOString(),
        )
      }}
      className="card w-[104px] shrink-0 px-1.5 py-2 text-center text-[11px] tabular-nums text-ink-dim outline-none focus:border-accent/60"
    />
  )
}

function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function Field({
  label,
  value,
  onChange,
  min,
  invalid,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  min?: number
  invalid?: boolean
}) {
  return (
    <div>
      <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">₪</span>
        <input
          type="number"
          inputMode="decimal"
          min={min}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`card w-full py-2.5 pl-7 pr-3 font-display text-lg font-bold text-ink outline-none focus:border-accent/60 ${
            invalid ? 'border-danger' : ''
          }`}
        />
      </div>
    </div>
  )
}
