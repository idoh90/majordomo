import { CONSOLES } from './consoles'
import { voice } from '../core/voice'
import { useManorUi } from './manor/uiStore'
import { useTrainingUi } from '../modules/training/uiStore'
import { useWatchUi } from '../modules/watch/uiStore'
import { useStudyUi } from '../modules/study/uiStore'
import { useCapitalUi } from '../modules/capital/uiStore'

/**
 * The mobile bottom tab bar (the design's mobile chrome): every view one
 * thumb away, plus the contextual + — each wing's primary verb, tinted with
 * its accent. Hidden at md+, where the header tabs take over.
 */

// 20×20 stroke glyphs, one per view (the design's icon set + a book for Study)
const ICONS: Record<string, string> = {
  manor: 'M4 5v11M10 3v13M16 7v9',
  watch: 'M10 3a7 7 0 1 1 0 14a7 7 0 1 1 0-14M10 6v4l3 2',
  training: 'M3 8v4M6 5.5v9M14 5.5v9M17 8v4M6 10h8',
  study:
    'M10 5.2C8.6 4 6.6 3.4 4 3.4v12.2c2.6 0 4.6.6 6 1.8 1.4-1.2 3.4-1.8 6-1.8V3.4c-2.6 0-4.6.6-6 1.8ZM10 5.2v12.2',
  capital: 'M4 4h12v12H4zM7 8h6M7 11h4',
}

// the + takes the active wing's accent (the Manor uses the preset accent)
const ADD_ACCENT: Record<string, string> = {
  manor: 'var(--color-accent)',
  watch: 'var(--color-w-watch)',
  training: 'var(--color-w-grounds)',
  study: 'var(--color-w-study)',
  capital: 'var(--color-w-ledger)',
}

const ADD_ARIA: Record<string, string> = {
  manor: 'Quick add',
  watch: 'Post a watch',
  training: 'Log workout',
  study: 'Book a session',
  capital: 'Add to the ledger',
}

/** tab labels drop the leading article — MANOR, WATCH, … per the design */
const short = (label: string) => label.replace(/^THE\s+/i, '')

export function TabBar({ view, onNav }: { view: string; onNav: (view: string) => void }) {
  const tabs = [
    { id: 'manor', label: voice.manor.name },
    ...CONSOLES.map((c) => ({ id: c.id, label: c.name })),
  ]

  const onAdd = () => {
    navigator.vibrate?.(8)
    if (view === 'manor') useManorUi.getState().requestQuickAdd()
    else if (view === 'watch') useWatchUi.getState().requestPost()
    else if (view === 'training') useTrainingUi.getState().requestAddSheet()
    else if (view === 'study') useStudyUi.getState().requestAddSheet()
    else if (view === 'capital') useCapitalUi.getState().requestAddSheet()
  }

  return (
    <nav
      aria-label="Views"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line px-3.5 pt-2 md:hidden"
      style={{
        background: 'color-mix(in srgb, var(--color-panel) 90%, transparent)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom))',
      }}
    >
      <div className="flex items-center gap-1">
        {tabs.map((t) => {
          const on = view === t.id
          return (
            <button
              key={t.id}
              type="button"
              aria-current={on ? 'page' : undefined}
              onClick={() => {
                if (!on) navigator.vibrate?.(4)
                onNav(t.id)
              }}
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
  )
}
