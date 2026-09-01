import { voice } from '../../../../core/voice'
import { SPORT_DOOR_OPEN } from '../../data/sports'
import type { LogMethod } from '../../lib/recast'

interface MethodStepProps {
  onChoose: (method: LogMethod) => void
  /** the door a session already came through, marked so this step cannot be
   *  mistaken for the blank one a new workout opens on. Null while logging a
   *  new session, where there is nothing to be current. */
  current?: LogMethod | null
}

export function MethodStep({ onChoose, current = null }: MethodStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <Choice
        title={voice.grounds.exercises.methodTitle}
        caption={voice.grounds.exercises.methodCaption}
        current={current === 'exercises'}
        onClick={() => onChoose('exercises')}
      />
      <Choice
        title="PUSH / PULL / LEGS"
        caption="One tap — the split fills in the muscles for you."
        current={current === 'ppl'}
        onClick={() => onChoose('ppl')}
      />
      <Choice
        title="PICK MUSCLES"
        caption="Choose exactly which muscles you hit."
        current={current === 'custom'}
        onClick={() => onChoose('custom')}
      />
      <Choice
        title="RUN"
        caption="Distance and pace. Feeds recovery, not the weekly count."
        current={current === 'run'}
        onClick={() => onChoose('run')}
      />
      {/* OTHER SPORT is DEV-only for now — see SPORT_DOOR_OPEN for why, and for
          what stays reachable regardless */}
      {SPORT_DOOR_OPEN && (
        <Choice
          title={voice.grounds.sport.methodTitle}
          caption={voice.grounds.sport.methodCaption}
          current={current === 'sport'}
          onClick={() => onChoose('sport')}
        />
      )}
    </div>
  )
}

function Choice({
  title,
  caption,
  current,
  onClick,
}: {
  title: string
  caption: string
  current: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? 'true' : undefined}
      className={`card group p-4 text-left transition-colors hover:border-accent/70 ${
        current ? 'border-accent/60' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="font-display text-lg font-bold tracking-[0.1em] text-ink transition-colors group-hover:text-accent">
          {title}
        </div>
        {current && (
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.14em] text-accent">
            {voice.grounds.recast.currentTag}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-sm text-ink-dim">{caption}</div>
    </button>
  )
}
