import { useShellStore } from '../../core/store/shell'
import { SKINS } from '../../core/ui/skins'
import { strainToColor } from '../../modules/training/lib/strainColor'
import { voice } from '../../core/voice'
import { KIND_META } from './kinds'

/**
 * The key to the calendar's computed colour.
 *
 * A full legend already existed — but behind `md:hidden`, in month view only,
 * i.e. hidden exactly where the complaint was loudest and absent from the week
 * entirely. So the day-header strain bars and the month's heat tints were
 * unexplained colour, and a new user reads red as an error.
 *
 * One component, two variants, so the two views cannot drift apart:
 *   · `month` — kind dots, the "runs past" glyph, the heat-tint swatch
 *   · `week`  — kind dots and the strain gradient, compact enough for the
 *               header row; the week draws its seam as a dotted cut, not a
 *               glyph, so that is what it explains instead.
 *
 * Minimal styling on purpose: the designed version belongs to the revamp.
 */
export function ManorLegend({ variant }: { variant: 'month' | 'week' }) {
  const ramp = SKINS[useShellStore((s) => s.skin)].heatRamp
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] lowercase text-ink-dim">
      {(['shift', 'training', 'study', 'marker', 'abroad'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className="h-[5px] w-[5px] rounded-full" style={{ background: KIND_META[k].color }} />
          {KIND_META[k].label}
        </span>
      ))}
      {variant === 'month' ? (
        <span className="inline-flex items-center gap-1.5">
          <span style={{ color: 'var(--color-w-watch)' }}>→</span>
          {voice.manor.monthLegend.runsPast}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-3 w-3.5 rounded-[2px]"
            style={{
              borderTop: '2px dotted color-mix(in srgb, var(--color-ink) 45%, transparent)',
              borderBottom: '2px dotted color-mix(in srgb, var(--color-ink) 45%, transparent)',
            }}
          />
          {voice.manor.monthLegend.runsPast}
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        {variant === 'month' ? (
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ background: 'color-mix(in srgb, var(--color-danger) 12%, var(--color-panel))' }}
          />
        ) : (
          // the day-header bar's own ramp, so the swatch and the bars match
          // under every skin without a second colour table. Strain is a 0–10
          // scale — sampling 0..1 would land every stop under VISUAL_FLOOR and
          // paint three identical greys.
          <span
            className="inline-block h-[5px] w-8 rounded-pill"
            style={{
              background: `linear-gradient(90deg, ${strainToColor(1.5, ramp)}, ${strainToColor(
                6,
                ramp,
              )}, ${strainToColor(10, ramp)})`,
            }}
          />
        )}
        {voice.manor.monthLegend.strain}
      </span>
    </div>
  )
}
