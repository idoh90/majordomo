import { voice } from '../voice'
import { Section } from './Section'
import './whatif.css'

/* ---------------------------------------------------------------------------
   The what-if strip.

   The one claim on this page that no other calendar can answer, so it gets a
   visual rather than an adjective: a block drags, a dashed ghost holds its
   old place, and a diff panel reads the damage before anything is committed.

   The loop is pure CSS — transform and opacity keyframes, no timeline, no JS.
   Its resting frame is the applied state, which is what reduced motion ships.
--------------------------------------------------------------------------- */

const TONE: Record<string, string> = {
  up: 'var(--color-w-grounds)',
  down: 'var(--color-danger)',
  flat: 'var(--color-ink-dim)',
}

export default function WhatIf() {
  return (
    <Section className="pt-20 md:pt-32">
      <div className="panel grid items-center gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,420px)] md:gap-12 md:p-10">
        <div>
          <h2 className="font-display text-[20px] leading-tight font-semibold tracking-[0.14em] text-ink sm:text-[24px] md:text-[27px] md:tracking-[0.16em]">
            {voice.whatif.title}
          </h2>
          <p className="mt-4 max-w-[520px] text-[15px] leading-relaxed text-pretty text-ink-dim md:text-[16.5px]">
            {voice.whatif.body}
          </p>
        </div>

        <div className="wi trough relative p-4 md:p-5" aria-hidden="true">
          <div className="mb-3 flex items-center">
            {/* the sandbox badge and APPLY below are the APP's accent, not
                brass: brass belongs to the page's one real CTA and the word,
                and a second brass button — even a drawn one — competes with it */}
            <span
              className="rounded-full px-2.5 py-[3px] font-display text-[9.5px] font-bold tracking-[0.2em]"
              style={{
                color: 'var(--color-accent)',
                border: '1px solid color-mix(in srgb, var(--color-accent) 45%, transparent)',
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
              }}
            >
              {voice.whatif.sandbox}
            </span>
            <span className="ml-auto text-[9.5px] tracking-[0.16em] tabular-nums text-ink-dim">
              {voice.whatif.days}
            </span>
          </div>

          <div className="flex gap-2">
            {/* the hour rail */}
            <div className="relative w-6 shrink-0">
              {[6, 12, 18].map((h) => (
                <span
                  key={h}
                  className="absolute right-0 -translate-y-1/2 text-[8px] tabular-nums text-ink-dim"
                  style={{ top: `${(h / 24) * 100}%` }}
                >
                  {String(h).padStart(2, '0')}
                </span>
              ))}
            </div>

            {/* WED — the block leaves from here */}
            <div className="wi-col relative h-[180px] flex-1 rounded-md border border-line/60">
              <div
                className="wi-ghost absolute inset-x-[3px] rounded-[6px] border border-dashed"
                style={{
                  top: '25%',
                  height: '7%',
                  borderColor: 'color-mix(in srgb, var(--color-w-grounds) 55%, transparent)',
                }}
              >
                <span className="absolute inset-0 flex items-center justify-center font-display text-[7.5px] tracking-[0.12em] text-ink-dim">
                  {voice.whatif.ghostLabel}
                </span>
              </div>
              <div
                className="booked absolute inset-x-[3px] flex items-center justify-center"
                style={
                  {
                    '--booked-accent': 'var(--color-w-watch)',
                    top: '79%',
                    height: '21%',
                  } as React.CSSProperties
                }
              >
                <span className="font-display text-[8px] font-semibold tracking-[0.1em] text-ink">
                  {voice.whatif.watchLabel}
                </span>
              </div>
            </div>

            {/* THU — and lands here */}
            <div className="wi-col relative h-[180px] flex-1 rounded-md border border-line/60">
              <div
                className="booked booked-hatch booked-dim absolute inset-x-[3px]"
                style={
                  { '--booked-accent': 'var(--color-ink-dim)', top: '35%', height: '23%' } as React.CSSProperties
                }
              />
              <div
                className="booked booked-cut-before absolute inset-x-[3px] flex items-start px-1.5 pt-1"
                style={
                  { '--booked-accent': 'var(--color-w-watch)', top: '0%', height: '33%' } as React.CSSProperties
                }
              >
                <span className="font-display text-[7.5px] font-semibold tracking-[0.1em] text-ink-dim">
                  {voice.whatif.watchTail}
                </span>
              </div>
              <div
                className="wi-block booked absolute inset-x-[3px] flex items-center justify-center"
                style={
                  {
                    '--booked-accent': 'var(--color-w-grounds)',
                    top: '62.5%',
                    height: '7%',
                  } as React.CSSProperties
                }
              >
                <span className="font-display text-[7.5px] font-semibold tracking-[0.12em] text-ink whitespace-nowrap">
                  {voice.whatif.ghostLabel}
                </span>
              </div>
            </div>
          </div>

          {/* the difference, read before anything is committed */}
          <div className="wi-diff subcard mt-3 p-3">
            <div className="card-title mb-2">{voice.whatif.diffTitle}</div>
            <dl className="space-y-1">
              {voice.whatif.diff.map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[11.5px] text-ink-dim">{row.label}</dt>
                  <dd
                    className="font-display text-[13px] font-semibold tabular-nums"
                    style={{ color: TONE[row.tone] }}
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex gap-2">
              <span
                className="btn-cta h-7 flex-1 text-[10px]"
                style={{ background: 'var(--color-accent)' }}
              >
                {voice.whatif.apply}
              </span>
              <span className="flex h-7 flex-1 items-center justify-center rounded-[9px] border border-line font-display text-[10px] font-semibold tracking-[0.16em] text-ink-dim">
                {voice.whatif.discard}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}
