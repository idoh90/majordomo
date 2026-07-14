import { useEffect, useState, type ReactNode } from 'react'
import { Sheet } from '../../../core/ui/Sheet'
import { makeId } from '../../../core/ids'
import { useCapitalStore } from '../store'
import type { RecurringExpense, SpendItem } from '../types'
import { itemsForMonth, monthKey, monthLabel } from '../lib/budget'
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

/** Manage this month's spending: a monthly budget, plus either a quick typed
 *  total (when nothing's itemized) or itemized recurring + one-off items. */
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
  const mk = monthKey(nowDate)

  const [budget, setBudget] = useState('')
  const [quick, setQuick] = useState('')
  const [rec, setRec] = useState<RecDraft[]>([])
  const [items, setItems] = useState<ItemDraft[]>([])

  useEffect(() => {
    if (!open) return
    setBudget(monthlyBudget ? String(monthlyBudget) : '')
    setQuick(spends[mk] != null ? String(spends[mk]) : '')
    setRec(storeRecurring.map((r) => ({ id: r.id, name: r.name, amount: String(r.amount), active: r.active })))
    setItems(
      itemsForMonth(storeItems, mk).map((i) => ({ id: i.id, name: i.name, amount: String(i.amount), date: i.date })),
    )
  }, [open, monthlyBudget, spends, mk, storeRecurring, storeItems])

  const num = (s: string) => Math.max(0, parseFloat(s) || 0)
  const recTotal = rec.filter((r) => r.active).reduce((s, r) => s + num(r.amount), 0)
  const itemsTotal = items.reduce((s, i) => s + num(i.amount), 0)
  // additive: card snapshot + recurring + one-offs
  const spent = num(quick) + recTotal + itemsTotal
  const budgetNum = num(budget)
  const over = budgetNum > 0 && spent > budgetNum

  const save = () => {
    setMonthlyBudget(budgetNum)
    const cleanRec: RecurringExpense[] = rec
      .filter((r) => num(r.amount) > 0)
      .map((r) => ({ id: r.id, name: r.name.trim() || 'Expense', amount: num(r.amount), active: r.active }))
    const cleanItems: SpendItem[] = items
      .filter((i) => num(i.amount) > 0)
      .map((i) => ({ id: i.id, name: i.name.trim() || 'Item', amount: num(i.amount), date: i.date }))
    setRecurring(cleanRec)
    setMonthItems(mk, cleanItems)
    setSpend(mk, num(quick))
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">Spending · {monthLabel(nowDate)}</h2>
      <p className="mb-4 text-sm text-ink-dim">
        Card spend + recurring + one-offs add up to the month's total.
      </p>

      <FieldRow>
        <Field label="Monthly budget" value={budget} onChange={setBudget} />
        <Field label="Card spending so far" value={quick} onChange={setQuick} />
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
        title={`This month · ${monthLabel(nowDate)}`}
        hint="One-off spends — groceries, fuel, dining…"
        onAdd={() => setItems((i) => [...i, { id: makeId(), name: '', amount: '', date: nowDate.toISOString() }])}
      >
        {items.map((i) => (
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
        <span className="text-sm text-ink-dim">Total this month</span>
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
