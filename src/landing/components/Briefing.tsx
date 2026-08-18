import { voice } from '../voice'
import { Section } from './Section'

/* ---------------------------------------------------------------------------
   The briefing.

   The smallest feature on the page and the one that proves the point, so it
   gets the same weight as the what-if strip. The notification is HTML, never
   an image: it has to stay crisp at any size, translate with the rest of the
   page, and be readable by a screen reader.
--------------------------------------------------------------------------- */

export default function Briefing() {
  const n = voice.briefing.notification

  return (
    <Section className="pt-20 md:pt-32">
      <div className="grid items-center gap-9 md:grid-cols-[minmax(0,1fr)_minmax(0,380px)] md:gap-14">
        <div>
          <h2 className="font-display text-[20px] leading-tight font-semibold tracking-[0.14em] text-ink sm:text-[24px] md:text-[27px] md:tracking-[0.16em]">
            {voice.briefing.title}
          </h2>
          <p className="mt-4 max-w-[540px] text-[15px] leading-relaxed text-pretty text-ink-dim md:text-[16.5px]">
            {voice.briefing.body}
          </p>
        </div>

        {/* a phone at rest, at 16:30, two and a half hours before duty */}
        <div className="mx-auto w-full max-w-[340px]">
          <div className="trough relative overflow-hidden px-4 pt-14 pb-16">
            <span className="absolute top-5 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-line" />
            <div className="mb-5 text-center">
              <div className="font-display text-[44px] leading-none font-semibold tabular-nums text-ink">
                {voice.moment.time}
              </div>
              <div className="mt-1 text-[11px] tracking-[0.14em] text-ink-dim">
                {voice.moment.date}
              </div>
            </div>

            <div className="subcard flex items-start gap-3 p-3">
              <span className="mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent font-display text-[11px] font-bold text-accent">
                M
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-[11.5px] font-bold tracking-[0.12em] text-ink">
                    {n.app}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-ink-dim">· {voice.moment.time}</span>
                </div>
                <p className="mt-1 text-[12.5px] leading-snug text-pretty text-ink-dim">{n.body}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  )
}
