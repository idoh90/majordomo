import { useState } from 'react'
import { Collapsible } from '../../../../core/ui/Collapsible'
import { voice } from '../../../../core/voice'

export interface BlockLinkOption {
  id: string
  title: string
  /** "Today · 7:15 AM" */
  when: string
}

export interface BlockLink {
  /** the voiced note — names the block, or says none is claimed */
  line: string
  /** candidate blocks, best first; a lone candidate stays passive */
  options: BlockLinkOption[]
  /** the block this session will claim — null once aimed at none */
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/**
 * The log-fulfills-block note. One candidate keeps the old passive line; two
 * or more make it tappable, so a log filed against a morning block that
 * passed unrecorded can still be aimed elsewhere — or at nothing. The default
 * is always the rank-1 match, so the fast path costs no extra tap.
 */
export function BlockLinkNote({ line, options, selectedId, onSelect }: BlockLink) {
  const [open, setOpen] = useState(false)

  if (options.length < 2) {
    return (
      <p className="mt-4 flex items-center gap-2 text-xs text-ink-dim">
        <Dot />
        {line}
      </p>
    )
  }

  const choose = (id: string | null) => {
    onSelect(id)
    setOpen(false)
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-xs text-ink-dim transition-colors hover:text-ink"
      >
        <Dot />
        <span className="min-w-0 flex-1">{line}</span>
        <span className="shrink-0 text-[11px] text-ink-faint underline underline-offset-2">
          {voice.grounds.fulfilsChange}
        </span>
      </button>
      {/* it used to slide in and then vanish on the way out — picking a block
          closes this, and that was the half nobody saw animate */}
      <Collapsible open={open}>
        <div
          role="radiogroup"
          aria-label="Which block this fulfils"
          className="card mt-2 overflow-hidden p-0"
        >
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={o.id === selectedId}
              onClick={() => choose(o.id)}
              className="flex w-full items-center gap-2.5 border-b border-line px-3 py-2.5 text-left transition-colors hover:bg-panel-2"
            >
              <Mark on={o.id === selectedId} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{o.title}</span>
              <span className="shrink-0 text-xs text-ink-dim [font-variant-numeric:tabular-nums]">
                {o.when}
              </span>
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={selectedId === null}
            onClick={() => choose(null)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-panel-2"
          >
            <Mark on={selectedId === null} />
            <span className="flex-1 text-sm text-ink-dim">{voice.grounds.fulfilsNoBlock}</span>
          </button>
        </div>
      </Collapsible>
    </div>
  )
}

function Dot() {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: 'var(--color-w-grounds)' }}
    />
  )
}

function Mark({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
        on ? 'border-accent' : 'border-line'
      }`}
    >
      {on && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  )
}
