interface MethodStepProps {
  onChoose: (method: 'ppl' | 'custom') => void
}

export function MethodStep({ onChoose }: MethodStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => onChoose('ppl')}
        className="card group p-4 text-left transition-colors hover:border-accent/70"
      >
        <div className="font-display text-lg font-bold tracking-[0.1em] text-ink transition-colors group-hover:text-accent">
          PUSH / PULL / LEGS
        </div>
        <div className="mt-0.5 text-sm text-ink-dim">
          One tap — the split fills in the muscles for you.
        </div>
      </button>
      <button
        type="button"
        onClick={() => onChoose('custom')}
        className="card group p-4 text-left transition-colors hover:border-accent/70"
      >
        <div className="font-display text-lg font-bold tracking-[0.1em] text-ink transition-colors group-hover:text-accent">
          PICK MUSCLES
        </div>
        <div className="mt-0.5 text-sm text-ink-dim">
          Choose exactly which muscles you hit.
        </div>
      </button>
    </div>
  )
}
