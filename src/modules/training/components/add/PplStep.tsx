import type { PplType } from '../../types'

const OPTIONS: { type: PplType; label: string; caption: string }[] = [
  { type: 'push', label: 'PUSH', caption: 'Chest · Delts · Triceps' },
  { type: 'pull', label: 'PULL', caption: 'Lats · Biceps · Rear Delts' },
  { type: 'legs', label: 'LEGS', caption: 'Quads · Hams · Glutes' },
]

interface PplStepProps {
  value: PplType | null
  onChoose: (ppl: PplType) => void
}

export function PplStep({ value, onChoose }: PplStepProps) {
  return (
    <div className="flex flex-col gap-3">
      {OPTIONS.map((o) => {
        const active = value === o.type
        return (
          <button
            key={o.type}
            type="button"
            onClick={() => onChoose(o.type)}
            className={`card group p-4 text-left transition-colors ${
              active ? 'border-accent bg-accent/10' : 'hover:border-accent/70'
            }`}
          >
            <div
              className={`font-display text-xl font-bold tracking-[0.18em] transition-colors ${
                active ? 'text-accent' : 'text-ink group-hover:text-accent'
              }`}
            >
              {o.label}
            </div>
            <div className="mt-0.5 text-sm text-ink-dim">{o.caption}</div>
          </button>
        )
      })}
    </div>
  )
}
