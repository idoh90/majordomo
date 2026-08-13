import { useState } from 'react'
import { useWings } from './wings'
import { voice } from '../core/voice'
import { useManorUi } from './manor/uiStore'
import { useTrainingUi } from '../modules/training/uiStore'
import { useWatchUi } from '../modules/watch/uiStore'
import { useStudyUi } from '../modules/study/uiStore'
import { useCapitalUi } from '../modules/capital/uiStore'
import { useWorkshopUi } from '../modules/workshop/uiStore'

/**
 * The mobile bottom tab bar (the design's mobile chrome): every view one
 * thumb away, plus the contextual + — each wing's primary verb, tinted with
 * its accent. Hidden at md+, where the header tabs take over.
 *
 * Six views no longer fit five slots at 390px, so the bar holds the Manor and
 * the first three wings and folds the rest behind a WINGS tab — the Workshop
 * design session's answer to the sixth-tab squeeze. The fold opens a small
 * panel above the bar; while a folded wing is open, the WINGS tab wears that
 * wing's accent so the active state never disappears.
 *
 * Both the order and the membership are the household's (see `wings.ts`), so
 * the fold is not a fixed pair of wings: turn two off and the remaining four
 * ride the bar with no fold at all, because a WINGS tab that opens onto
 * nothing anyone chose to hide is a tab for its own sake.
 */

// 20×20 stroke glyphs, one per view (the design's icon set + a book for Study)
const ICONS: Record<string, string> = {
  manor: 'M4 5v11M10 3v13M16 7v9',
  watch: 'M10 3a7 7 0 1 1 0 14a7 7 0 1 1 0-14M10 6v4l3 2',
  training: 'M3 8v4M6 5.5v9M14 5.5v9M17 8v4M6 10h8',
  study:
    'M10 5.2C8.6 4 6.6 3.4 4 3.4v12.2c2.6 0 4.6.6 6 1.8 1.4-1.2 3.4-1.8 6-1.8V3.4c-2.6 0-4.6.6-6 1.8ZM10 5.2v12.2',
  workshop: 'M13 5.5a3 3 0 0 1 4-2.9l-2 2 1.5 1.5 2-2a3 3 0 0 1-3.7 3.8L7.5 15a1.6 1.6 0 1 1-2.2-2.2L13 5.5Z',
  capital: 'M4 4h12v12H4zM7 8h6M7 11h4',
}

// the + takes the active wing's accent (the Manor uses the preset accent)
const ADD_ACCENT: Record<string, string> = {
  manor: 'var(--color-accent)',
  watch: 'var(--color-w-watch)',
  training: 'var(--color-w-grounds)',
  study: 'var(--color-w-study)',
  workshop: 'var(--color-w-workshop)',
  capital: 'var(--color-w-ledger)',
}

const ADD_ARIA: Record<string, string> = {
  manor: 'Quick add',
  watch: 'Post a watch',
  training: 'Log workout',
  study: 'Book a session',
  workshop: 'Book bench time',
  capital: 'Add to the ledger',
}

/** wings that fit the bar beside the Manor when nothing has to fold */
const BAR_WINGS = 4
/** …and how many ride it once the WINGS tab has to take a slot of its own */
const INLINE_WINGS = 3

/** tab labels drop the leading article — MANOR, WATCH, … per the design */
const short = (label: string) => label.replace(/^THE\s+/i, '')

export function TabBar({ view, onNav }: { view: string; onNav: (view: string) => void }) {
  const [wingsOpen, setWingsOpen] = useState(false)
  const { visible } = useWings()

  const cut = visible.length > BAR_WINGS ? INLINE_WINGS : visible.length
  const inline = [
    { id: 'manor', label: voice.manor.name },
    ...visible.slice(0, cut).map((c) => ({ id: c.id, label: c.name })),
  ]
  const folded = visible.slice(cut).map((c) => ({ id: c.id, label: c.name }))
  const foldedActive = folded.some((t) => t.id === view)

  const nav = (id: string) => {
    if (view !== id) navigator.vibrate?.(4)
    setWingsOpen(false)
    onNav(id)
  }

  const onAdd = () => {
    navigator.vibrate?.(8)
    if (view === 'manor') useManorUi.getState().requestQuickAdd()
    else if (view === 'watch') useWatchUi.getState().requestPost()
    else if (view === 'training') useTrainingUi.getState().requestAddSheet()
    else if (view === 'study') useStudyUi.getState().requestAddSheet()
    else if (view === 'workshop') useWorkshopUi.getState().requestAddSheet()
    else if (view === 'capital') useCapitalUi.getState().requestAddSheet()
  }

  return (
    <>
      {/* The fold's scrim is a SIBLING of the bar, never a child of it: the bar
          carries a backdrop-filter, which makes it the containing block for any
          fixed descendant — a `fixed inset-0` inside it covers the bar's own
          65 px, not the screen, so tapping away would not close the fold. */}
      {wingsOpen && (
        <button
          type="button"
          aria-label="Close"
          onClick={() => setWingsOpen(false)}
          className="fixed inset-0 z-40 cursor-pointer md:hidden"
        />
      )}
      <nav
        aria-label="Views"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line px-3.5 pt-2 md:hidden"
        style={{
          background: 'color-mix(in srgb, var(--color-panel) 90%, transparent)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
          /* Pinned to its own compositing layer, deliberately.
             A `position: fixed` bar that also carries a backdrop-filter is the
             one combination iOS Safari is known to re-composite against the
             SCROLLING content instead of the viewport — the bar then drifts
             upward as the page moves, which is precisely the reported symptom
             and one that reproduces on no engine I can drive here (Chrome
             desktop and Chrome mobile emulation both hold it steady, in layout
             and in hit-testing, on dev and on production).
             Promoting the layer up front takes the bar out of that path: the
             blur is then composited once rather than re-evaluated against
             whatever is sliding beneath it. `translateZ(0)` is safe here only
             because the fold's scrim is a SIBLING — a transform would
             otherwise make this element the containing block for it. */
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
      >
        {wingsOpen && (
          <div className="menu-panel absolute bottom-full right-3.5 z-50 mb-2 flex min-w-[180px] flex-col py-1.5 animate-[fade-in_160ms_ease-out]">
            {folded.map((t) => {
              const on = view === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => nav(t.id)}
                  className="flex min-h-11 items-center gap-3 px-4 py-2 text-left"
                  style={{ color: on ? (ADD_ACCENT[t.id] ?? 'var(--color-accent)') : 'var(--color-ink)' }}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path
                      d={ICONS[t.id] ?? ICONS.manor}
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="font-display text-[11px] font-semibold tracking-[0.16em]">
                    {t.label}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex items-center gap-1">
        {inline.map((t) => {
          const on = view === t.id
          return (
            <button
              key={t.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => nav(t.id)}
              className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] px-0.5 py-1 transition-colors"
              style={{ color: on ? 'var(--color-accent)' : 'var(--color-ink-dim)' }}
            >
              <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path
                  d={ICONS[t.id] ?? ICONS.manor}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-display text-[8.5px] font-semibold tracking-[0.16em]">
                {short(t.label)}
              </span>
            </button>
          )
        })}
        {folded.length > 0 && (
          <button
            type="button"
            aria-expanded={wingsOpen}
            aria-current={foldedActive ? 'page' : undefined}
            onClick={() => {
              navigator.vibrate?.(4)
              setWingsOpen((o) => !o)
            }}
            className="flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-[3px] px-0.5 py-1 transition-colors"
            style={{
              color: foldedActive
                ? (ADD_ACCENT[view] ?? 'var(--color-accent)')
                : 'var(--color-ink-dim)',
            }}
          >
            <span className="flex h-[19px] items-center text-[15px] leading-none tracking-[2px]">
              ···
            </span>
            <span className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-display text-[8.5px] font-semibold tracking-[0.16em]">
              {voice.wingsTab}
            </span>
          </button>
        )}
        <button
          type="button"
          aria-label={ADD_ARIA[view] ?? ADD_ARIA.manor}
          onClick={onAdd}
          className="ml-1 flex h-[46px] w-[46px] flex-none items-center justify-center rounded-full text-[22px] font-semibold leading-none transition active:scale-95"
          style={{
            background: ADD_ACCENT[view] ?? ADD_ACCENT.manor,
            color: 'var(--color-bg)',
            boxShadow: `0 0 18px color-mix(in srgb, ${ADD_ACCENT[view] ?? ADD_ACCENT.manor} 40%, transparent)`,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
        </div>
      </nav>
    </>
  )
}
