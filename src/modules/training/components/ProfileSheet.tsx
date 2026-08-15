import { useEffect, useState } from 'react'
import { DEFAULT_PROFILE, bmr, restMaintenance, type Profile } from '../lib/nutrition'
import { useWorkoutStore } from '../store'
import { Collapsible } from '../../../core/ui/Collapsible'
import { CollapseChevron } from '../../../core/ui/CollapseToggle'
import { SegmentedControl } from '../../../core/ui/SegmentedControl'
import { Sheet } from '../../../core/ui/Sheet'
import { voice } from '../../../core/voice'
import type { NutritionGoal } from '../../../core/voice/types'

interface ProfileSheetProps {
  open: boolean
  onClose: () => void
}

const GOAL_ORDER: NutritionGoal[] = ['cut', 'maintain', 'bulk']

export function ProfileSheet({ open, onClose }: ProfileSheetProps) {
  const stored = useWorkoutStore((s) => s.profile)
  const setProfile = useWorkoutStore((s) => s.setProfile)
  const [draft, setDraft] = useState<Profile>(stored)
  const [advanced, setAdvanced] = useState(false)
  const c = voice.grounds.profileSheet

  useEffect(() => {
    if (open) setDraft(stored)
  }, [open, stored])

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const save = () => {
    setProfile(draft)
    onClose()
  }

  // dirty means DIFFERS FROM THE STORE, not "was touched" — paging through the
  // sheet and putting a value back must not raise a discard prompt. Both sides
  // are the same Profile shape, so key order is stable.
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored)

  const maint = Math.round(restMaintenance(draft))

  return (
    <Sheet open={open} onClose={onClose} dirty={dirty}>
      <h2 className="mb-1 font-display text-xl font-bold tracking-wide">{c.title}</h2>
      <p className="mb-4 text-sm text-ink-dim">
        {c.intro({
          maint: maint.toLocaleString(),
          bmr: Math.round(bmr(draft)).toLocaleString(),
        })}
      </p>

      <div className="mb-4">
        <FieldLabel>{c.goalLabel}</FieldLabel>
        <SegmentedControl<NutritionGoal>
          options={GOAL_ORDER.map((g) => ({ value: g, label: voice.grounds.fuelGoalChip[g] }))}
          value={draft.goal}
          onChange={(g) => set('goal', g)}
        />
        <p className="mt-1.5 text-xs text-ink-faint">{c.goalBlurb[draft.goal]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField
          label={c.weightLabel}
          unit={c.weightUnit}
          value={draft.weightKg}
          onChange={(v) => set('weightKg', v)}
          step={0.5}
        />
        <NumField
          label={c.heightLabel}
          unit={c.heightUnit}
          value={draft.heightCm}
          onChange={(v) => set('heightCm', v)}
        />
        <NumField
          label={c.ageLabel}
          unit={c.ageUnit}
          value={draft.age}
          onChange={(v) => set('age', v)}
        />
        <div>
          <FieldLabel>{c.sexLabel}</FieldLabel>
          <div className="flex gap-1.5">
            {([['male', c.sexMale], ['female', c.sexFemale]] as const).map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => set('sex', s)}
                className={`card flex-1 py-2.5 text-sm transition-colors ${
                  draft.sex === s
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'text-ink-dim hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <NumField
          label={c.proteinLabel}
          unit={c.proteinUnit}
          value={draft.proteinPerKg}
          onChange={(v) => set('proteinPerKg', v)}
          step={0.1}
        />
        <NumField
          label={c.mealsLabel}
          unit=""
          value={draft.mealsPerDay}
          onChange={(v) => set('mealsPerDay', v)}
        />
        <NumField
          label={c.activityLabel}
          unit={c.activityUnit}
          value={draft.restActivityFactor}
          onChange={(v) => set('restActivityFactor', v)}
          step={0.05}
        />
        {/* the rate the goal actually spends: a surplus while bulking, a
            deficit while cutting, and nothing at all while maintaining */}
        {draft.goal === 'bulk' && (
          <NumField
            label={c.surplusLabel}
            unit={c.kcalUnit}
            value={draft.surplusKcal}
            onChange={(v) => set('surplusKcal', v)}
            step={25}
          />
        )}
        {draft.goal === 'cut' && (
          <NumField
            label={c.deficitLabel}
            unit={c.kcalUnit}
            value={draft.deficitKcal}
            onChange={(v) => set('deficitKcal', v)}
            step={25}
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setAdvanced((a) => !a)}
        aria-expanded={advanced}
        className="group mt-4 flex min-h-11 w-full items-center justify-between text-sm text-ink-dim transition-colors hover:text-ink"
      >
        <span className="font-display text-xs font-bold uppercase tracking-[0.16em]">
          {c.advancedTitle}
        </span>
        <CollapseChevron expanded={advanced} />
      </button>
      <Collapsible open={advanced} innerClassName="grid grid-cols-2 gap-3 pt-2">
        <NumField
          label={c.carbFloorLabel}
          unit={c.gramsPerKgUnit}
          value={draft.carbFloorGkg}
          onChange={(v) => set('carbFloorGkg', v)}
          step={0.5}
        />
        <NumField
          label={c.fatFloorLabel}
          unit={c.gramsPerKgUnit}
          value={draft.fatFloorGkg}
          onChange={(v) => set('fatFloorGkg', v)}
          step={0.1}
        />
        <NumField
          label={c.kcalPerSetLabel}
          unit={c.kcalUnit}
          value={draft.kcalPerSet}
          onChange={(v) => set('kcalPerSet', v)}
        />
        <NumField
          label={c.carbPerSetLabel}
          unit={c.gramsUnit}
          value={draft.carbPerSet}
          onChange={(v) => set('carbPerSet', v)}
        />
      </Collapsible>

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => setDraft(DEFAULT_PROFILE)}
          className="btn-soft px-4 py-3 text-sm"
        >
          {c.reset}
        </button>
        <button type="button" onClick={save} className="btn-cta flex-1 py-3 text-base">
          {c.save}
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
