interface MethodStepProps {
  onChoose: (method: 'ppl' | 'custom' | 'run') => void
}

export function MethodStep({ onChoose }: MethodStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <Choice
        title="PUSH / PULL / LEGS"
        caption="One tap — the split fills in the muscles for you."
        onClick={() => onChoose('ppl')}
      />
      <Choice
        title="PICK MUSCLES"
        caption="Choose exactly which muscles you hit."
        onClick={() => onChoose('custom')}
      />
      <Choice
        title="RUN"
        caption="Distance and pace. Feeds recovery, not the weekly count."
        onClick={() => onChoose('run')}
      />
    </div>
  )
}

function Choice({
  title,
  caption,
  onClick,
}: {
  title: string
  caption: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card group p-4 text-left transition-colors hover:border-accent/70"
    >
      <div className="font-display text-lg font-bold tracking-[0.1em] text-ink transition-colors group-hover:text-accent">
        {title}
      </div>
      <div className="mt-0.5 text-sm text-ink-dim">{caption}</div>
    </button>
  )
}
