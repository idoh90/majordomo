import { useEffect } from 'react'
import { voice } from '../../../core/voice'
import type { BriefAreaId } from '../../../core/voice/types'
import { areaOn, useBriefPrefs } from './prefs'

/** which clause belongs to which wing, and in what order the brief writes them */
export const AREA_GROUPS: { wing: string; color: string; areas: BriefAreaId[] }[] = [
  { wing: voice.modules.watch.name, color: 'var(--color-w-watch)', areas: ['shifts'] },
  // THE NIGHT is not a wing — it has no tab and no screen — but it owns two
  // clauses and three instruments, and burying them under the Watch is what
  // made sleep invisible to anyone who has never stood a shift.
  { wing: voice.night.name, color: 'var(--color-w-sleep)', areas: ['sleep', 'rest'] },
  {
    wing: voice.modules.training.name,
    color: 'var(--color-w-grounds)',
    areas: ['workouts', 'muscles', 'food'],
  },
  {
    wing: voice.modules.workshop.name,
    color: 'var(--color-w-workshop)',
    areas: ['bench'],
  },
  { wing: voice.modules.study.name, color: 'var(--color-w-study)', areas: ['study', 'reports'] },
  {
    wing: voice.modules.capital.name,
    color: 'var(--color-w-ledger)',
    areas: ['worth', 'spending'],
  },
]

/**
 * THE PEN — what the brief covers.
 *
 * A popover rather than a sheet: the brief is right behind it and the point is
 * to see a clause disappear from the paragraph you were just reading. It is
 * dismissed the way every popover in the house is — a full-screen invisible
 * button behind it — and closing rewrites the brief, which is what the
 * footnote promises.
 */
export function Pen({ onClose }: { onClose: () => void }) {
  const areas = useBriefPrefs((s) => s.areas)
  const counsel = useBriefPrefs((s) => s.counsel)
  const toggleArea = useBriefPrefs((s) => s.toggleArea)
  const toggleCounsel = useBriefPrefs((s) => s.toggleCounsel)
  const V = voice.briefing.brief

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const chip = (on: boolean, color: string) => ({
    borderColor: on ? `color-mix(in srgb, ${color} 50%, transparent)` : 'var(--color-line)',
    background: on ? `color-mix(in srgb, ${color} 16%, transparent)` : 'transparent',
    color: on ? `color-mix(in srgb, ${color} 72%, var(--color-ink))` : 'var(--color-ink-faint)',
  })

  return (
    <>
      <button
        type="button"
        aria-label={V.pen.close}
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div className="menu-panel absolute inset-x-3 top-12 z-50 p-4 sm:left-auto sm:right-5 sm:w-[334px]">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[9.5px] font-semibold tracking-[0.2em] text-ink-dim">
            {V.pen.title}
          </span>
          <span className="text-[10px] italic text-ink-faint">{V.pen.sub}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={V.pen.close}
            className="ml-auto p-0.5 text-[12px] leading-none text-ink-faint transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        {AREA_GROUPS.map((g) => (
          <div key={g.wing} className="mt-2.5">
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: g.color }}
              />
              <span
                className="font-display text-[9px] font-semibold tracking-[0.18em]"
                style={{ color: `color-mix(in srgb, ${g.color} 62%, var(--color-ink-dim))` }}
              >
                {g.wing}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 pl-3">
              {g.areas.map((id) => {
                const on = areaOn(areas, id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleArea(id)}
                    aria-pressed={on}
                    className="rounded-pill border px-2.5 py-1 font-display text-[9.5px] font-semibold tracking-[0.12em] whitespace-nowrap transition-[filter] hover:brightness-125"
                    style={chip(on, g.color)}
                  >
                    {V.areaLabel[id]}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="mt-3 flex items-center gap-2 border-t border-line pt-2.5">
          <button
            type="button"
            onClick={toggleCounsel}
            aria-pressed={counsel}
            className="rounded-pill border px-2.5 py-1 font-display text-[9.5px] font-semibold tracking-[0.12em] whitespace-nowrap transition-[filter] hover:brightness-125"
            style={chip(counsel, 'var(--color-accent)')}
          >
            {V.pen.counselLabel}
          </button>
          <span className="text-[9.5px] text-ink-faint">{V.pen.counselNote}</span>
        </div>

        <p className="mt-2.5 text-[9.5px] italic text-ink-faint">{V.pen.note}</p>
      </div>
    </>
  )
}
