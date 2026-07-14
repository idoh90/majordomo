import { CONSOLES } from '../consoles'
import { voice } from '../../core/voice'

/**
 * The Manor — home. The week grid arrives with the events core (build plan
 * M3) and replaces the placeholder card below; until then the daily briefings
 * and the empty-week state hold the fort.
 */
export function ManorScreen() {
  return (
    <>
      {/* daily briefing — every wing contributes its own lines */}
      {CONSOLES.map((c) => c.Briefing && <c.Briefing key={c.id} />)}

      <div className="mt-4 rounded-[14px] border border-dashed border-line bg-panel/50 px-6 py-20 text-center">
        <div className="font-display text-[13px] font-semibold uppercase tracking-[0.32em] text-ink-dim">
          {voice.manor.name}
        </div>
        <p className="mt-3 text-[16.5px] text-ink">{voice.manor.empty}</p>
      </div>
    </>
  )
}
