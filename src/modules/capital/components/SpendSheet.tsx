import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { makeId } from '../../../core/ids'
import { voice } from '../../../core/voice'
import { useCapitalStore } from '../store'
import type { RecurringExpense, SpendItem } from '../types'
import { dateInMonth, itemsForMonth, monthKey, monthKeyLabel, shiftMonth } from '../lib/budget'
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
  // drafts per month key, so paging away and back keeps unsaved edits; `dirty`
  // is what Save commits, so merely LOOKING at a month writes nothing
  const [drafts, setDrafts] = useState<Record<string, MonthDraft>>({})
  const [dirty, setDirty] = useState<string[]>([])

  // fresh open = fresh drafts from the store, back on the current month. Keyed
  // on `open` alone on purpose: re-seeding on every store write would wipe the
  // draft the user is typing (including in the months they aren't looking at).
  useEffect(() => {
    if (!open) return
    setMonth(thisMonth)
    setBudget(monthlyBudget ? String(monthlyBudget) : '')
    setRec(storeRecurring.map((r) => ({ id: r.id, name: r.name, amount: String(r.amount), active: r.active })))
    setDrafts({})
    setDirty([])
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
  const patch = (fn: (d: MonthDraft) => MonthDraft) => {
    setDrafts((d) => ({ ...d, [month]: fn(d[month] ?? { quick: '', items: [] }) }))
    setDirty((list) => (list.includes(month) ? list : [...list, month]))
  }
  const setQuick = (quick: string) => patch((d) => ({ ...d, quick }))
  const setItems = (fn: (items: ItemDraft[]) => ItemDraft[]) => patch((d) => ({ ...d, items: fn(d.items) }))

  const num = (s: string) => Math.max(0, parseFloat(s) || 0)
  const recTotal = rec.filter((r) => r.active).reduce((s, r) => s + num(r.amount), 0)
  const itemsTotal = draft.items.reduce((s, i) => s + num(i.amount), 0)
  // additive, and identical to monthlySpent(): card snapshot + recurring + one-offs
  const spent = num(draft.quick) + recTotal + itemsTotal
  const budgetNum = num(budget)
  const over = budgetNum > 0 && spent > budgetNum

  const label = monthKeyLabel(month, nowDate)
  // forward stops at the present — or at the last month that holds data, so a
  // future-dated item can never end up unreachable
  const lastMonth = useMemo(() => {
    const keys = [thisMonth, ...Object.keys(spends), ...storeItems.map((i) => monthKey(new Date(i.date)))]
    return keys.sort().pop() ?? thisMonth // 'YYYY-MM' sorts chronologically
  }, [thisMonth, spends, storeItems])

  const save = () => {
    setMonthlyBudget(budgetNum)
    const cleanRec: RecurringExpense[] = rec
      .filter((r) => num(r.amount) > 0)
      .map((r) => ({ id: r.id, name: r.name.trim() || 'Expense', amount: num(r.amount), active: r.active }))
    setRecurring(cleanRec)
    // every month the user actually edited, not just the one on screen
    for (const mk of dirty) {
      const d = drafts[mk]
      if (!d) continue
      const cleanItems: SpendItem[] = d.items
        .filter((i) => num(i.amount) > 0)
        .map((i) => ({ id: i.id, name: i.name.trim() || 'Item', amount: num(i.amount), date: i.date }))
      setMonthItems(mk, cleanItems)
      setSpend(mk, num(d.quick))
    }
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
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
        <Field label="Monthly budget" value={budget} onChange={setBudget} />
        <Field label="Card spending" value={draft.quick} onChange={setQuick} />
      </FieldRow>
      <p className="mt-1 text-[11px] text-ink-faint">
        Card spending: overwrite whenever you check your card app — a running snapshot, not a log.
      </p>

      <Section
        title="Recurring monthly"
        hint="Rent, subscriptions — counted every month until removed."
        onAdd={() => setRec((r) => [...r, { id: makeId(), name: '', amount: '', active: true }])}
      >
        {rec.map((r) => (
          <LineRow
            key={r.id}
            name={r.name}
            amount={r.amount}
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
        hint="One-off spends — groceries, fuel, dining…"
        onAdd={() =>
          setItems((i) => [...i, { id: makeId(), name: '', amount: '', date: dateInMonth(month, nowDate) }])
        }
      >
        {draft.items.map((i) => (
          <LineRow
            key={i.id}
            name={i.name}
            amount={i.amount}
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
  onName,
  onAmount,
  onRemove,
  active,
  onToggle,
}: {
  name: string
  amount: string
  onName: (v: string) => void
  onAmount: (v: string) => void
  onRemove: () => void
  active?: boolean
  onToggle?: () => void
}) {
  const dimmed = active === false
  return (
    <div className={`flex items-center gap-2 ${dimmed ? 'opacity-45' : ''}`}>
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
      <div className="relative w-28 shrink-0">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-ink-faint">₪</span>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          className="card w-full py-2 pl-5 pr-2 text-right font-display text-sm font-bold text-ink outline-none focus:border-accent/60"
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
  )
}

function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="card w-full py-2.5 pl-7 pr-3 font-display text-lg font-bold text-ink outline-none focus:border-accent/60"
        />
      </div>
    </div>
  )
}
