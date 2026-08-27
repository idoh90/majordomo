import { useRecoveryEffect } from '../../../../core/sleep/useSleep'
import { voice } from '../../../../core/voice'

/**
 * What sleep is doing to the recovery clock, stated wherever the clock is read.
 *
 * The strain engine now runs on a scalar THE NIGHT hands it (core/sleep), and
 * a model that silently moves the numbers on a screen is worse than no model:
 * the body map is the one surface in this app people make a training decision
 * from, and "everything reads hotter this week" with no reason on the page is
 * indistinguishable from a bug.
 *
 * So it says three things and nothing else:
 *
 *  · the coupling is OFF → nothing. A switch somebody turned off is a decision,
 *    not an error, and repeating it back every visit is nagging.
 *  · it is on but the week is too thin → what it is waiting for. Four of seven
 *    is the gate, and a reader who has written down two nights deserves to
 *    know why the numbers have not moved.
 *  · it is on and biting → by how much, over how many nights, and the standing
 *    caveat that this came off a phone keyboard rather than a laboratory. The
 *    caveat is not optional decoration; it is the honest half of the claim.
 *
 * An estate that has never written a night down sees none of it. The Grounds
 * is not the place to advertise another system.
 */
export function SleepRecoveryNote() {
  const e = useRecoveryEffect()
  const V = voice.night.recovery

  if (!e.couplingOn) return null
  if (!e.applied && e.covered === 0) return null

  const accent = 'var(--color-w-sleep)'
  return (
    <div
      className="mt-3 rounded-[8px] border-l-2 py-1 pl-2.5"
      style={{ borderColor: `color-mix(in srgb, ${accent} 55%, transparent)` }}
    >
      <p className="text-[11.5px] leading-snug text-ink-dim">
        <span aria-hidden style={{ color: accent }}>
          ☾{' '}
        </span>
        {e.applied
          ? V.line({ pct: e.pct, avgH: e.avgH, covered: e.covered })
          : V.thin({ covered: e.covered, needed: e.needed })}
      </p>
      {e.applied && (
        <p className="mt-0.5 text-[10px] italic leading-snug text-ink-faint">{V.caveat}</p>
      )}
    </div>
  )
}
