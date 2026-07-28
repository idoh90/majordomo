import { useEffect, useState } from 'react'
import { DEFAULT_PROFILE, bmr, restMaintenance, type Profile } from '../lib/nutrition'
import { useWorkoutStore } from '../store'
import { CollapseChevron } from '../../../core/ui/CollapseToggle'
import { Sheet } from '../../../core/ui/Sheet'

interface ProfileSheetProps {
  open: boolean
  onClose: () => void
}

export function ProfileSheet({ open, onClose }: ProfileSheetProps) {
  const stored = useWorkoutStore((s) => s.profile)
  const setProfile = useWorkoutStore((s) => s.setProfile)
  const [draft, setDraft] = useState<Profile>(stored)
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    if (open) setDraft(stored)
  }, [open, stored])

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = () => {
    setProfile(draft)
    onClose()
  }

  const maint = Math.round(restMaintenance(draft))

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">Profile &amp; nutrition</h2>
      <p className="mb-4 text-sm text-ink-dim">
        Your macros are computed from this. Rest-day maintenance ≈{' '}
        <span className="font-semibold text-accent">{maint.toLocaleString()} kcal</span> (BMR{' '}
        {Math.round(bmr(draft)).toLocaleString()}).
      </p>

      <div className="grid grid-cols-2 gap-3">
        <NumField label="Weight" unit="kg" value={draft.weightKg} onChange={(v) => set('weightKg', v)} step={0.5} />
        <NumField label="Height" unit="cm" value={draft.heightCm} onChange={(v) => set('heightCm', v)} />
        <NumField label="Age" unit="yr" value={draft.age} onChange={(v) => set('age', v)} />
        <div>
          <FieldLabel>Sex</FieldLabel>
          <div className="flex gap-1.5">
            {(['male', 'female'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set('sex', s)}
                className={`card flex-1 py-2.5 text-sm capitalize transition-colors ${
                  draft.sex === s
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <NumField label="Protein" unit="g/kg" value={draft.proteinPerKg} onChange={(v) => set('proteinPerKg', v)} step={0.1} />
        <NumField label="Meals / day" unit="" value={draft.mealsPerDay} onChange={(v) => set('mealsPerDay', v)} />
        <NumField label="Activity" unit="× BMR" value={draft.restActivityFactor} onChange={(v) => set('restActivityFactor', v)} step={0.05} />
        <NumField label="Train-day surplus" unit="kcal" value={draft.surplusKcal} onChange={(v) => set('surplusKcal', v)} step={25} />
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        className="group mt-4 flex min-h-11 w-full items-center justify-between text-sm text-ink-dim transition-colors hover:text-ink"
      >
        <span className="font-display text-xs font-bold uppercase tracking-[0.16em]">
          Advanced flex tuning
        </span>
        <CollapseChevron expanded={advanced} />
      </button>
      {advanced && (
        <div className="mt-2 grid grid-cols-2 gap-3">
          <NumField label="Carb floor" unit="g/kg" value={draft.carbFloorGkg} onChange={(v) => set('carbFloorGkg', v)} step={0.5} />
          <NumField label="Fat floor" unit="g/kg" value={draft.fatFloorGkg} onChange={(v) => set('fatFloorGkg', v)} step={0.1} />
          <NumField label="kcal / hard set" unit="kcal" value={draft.kcalPerSet} onChange={(v) => set('kcalPerSet', v)} />
          <NumField label="carbs / hard set" unit="g" value={draft.carbPerSet} onChange={(v) => set('carbPerSet', v)} />
        </div>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_PROFILE)}
          className="btn-soft px-4 py-3 text-sm"
        >
          Reset
        </button>
        <button type="button" onClick={save} className="btn-cta flex-1 py-3 text-base">
          Save
        </button>
      </div>
    </Sheet>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block font-display text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">
      {children}
    </label>
  )
}

function NumField({
  label,
  unit,
  value,
  onChange,
  step = 1,
}: {
  label: string
  unit: string
  value: number
  onChange: (v: number) => void
  step?: number
}) {
  return (
    <div>
      <FieldLabel>
        {label}
        {unit && <span className="ml-1 text-ink-faint/70 normal-case tracking-normal">{unit}</span>}
      </FieldLabel>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
        className="card w-full px-3 py-2.5 font-display text-lg font-bold text-ink outline-none [color-scheme:dark] focus:border-accent/60"
      />
    </div>
  )
}
