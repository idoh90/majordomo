import { voice } from '../voice'
import GetStarted from './GetStarted'

/* ---------------------------------------------------------------------------
   The hero — direction 1b, "The Drafting Room": air and hairlines, the
   instrument revealed at the fold.

   The three-second test, which everything here serves:
     WHAT — a calendar (the sub says so in its first two words)
     WHO  — "schedules that fight back"
     DO   — the brass button, above the fold at 390×844, including the button

   The headline is the wordmark moment: the sentence sets in ink, MAJORDOMO
   alone in brass. Nothing else on the page is brass except the CTA and one
   rule, which is why the word reads as the brand rather than as emphasis.
--------------------------------------------------------------------------- */

export default function Hero() {
  return (
    <section className="relative">
      {/* a faint hour-rule field on the same pitch as the brass rule below it,
          so the hero reads as drawn on one sheet. Hero only — it stops at the
          fold, where the real grid takes over. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'repeating-linear-gradient(90deg, rgb(230 235 242 / 0.02) 0 1px, transparent 1px var(--rule-pitch))',
        }}
      />

      <div className="relative mx-auto max-w-[720px] px-5 pt-16 pb-10 text-center sm:pt-24 md:max-w-[820px] md:pt-[150px] md:pb-14">
        <h1 className="text-balance">
          <span className="block text-[23px] leading-tight text-ink sm:text-[28px] md:text-[34px]">
            {voice.hero.headlineLead}
          </span>
          <span className="mt-1.5 block font-display text-[56px] leading-none font-bold tracking-[0.02em] text-ember sm:text-[76px] md:text-[96px] md:tracking-[0.03em]">
            {voice.hero.headlineWord}
            {/* The full stop belongs to the sentence, not to the word, so it
                sets in ink AND in the body face — Big Shoulders draws a period
                as a square block, which at 96px reads as a missing glyph. Set
                smaller than the word: a body period at display size is a disc,
                not punctuation. */}
            <span className="font-body text-[0.5em] text-ink">.</span>
          </span>
        </h1>

        <p className="mx-auto mt-4 max-w-[580px] text-[15px] leading-relaxed text-pretty text-ink-dim sm:text-base md:mt-6 md:text-[17.5px]">
          {voice.hero.sub}
        </p>

        {/* the skip link's landing site — tabIndex so it can actually take
            focus, since a plain <div> target moves the scroll and nothing else */}
        <div id="enter" tabIndex={-1} className="mx-auto mt-7 max-w-[560px] md:mt-9">
          <GetStarted placement="hero" />
        </div>
      </div>
    </section>
  )
}
