import { voice } from './voice'
import Masthead from './components/Masthead'
import Hero from './components/Hero'
import BrassRule from './components/BrassRule'
import Demo from './demo/Demo'
import Wings from './components/Wings'
import WhatIf from './components/WhatIf'
import Briefing from './components/Briefing'
import FounderNote from './components/FounderNote'
import Faq from './components/Faq'
import Footer from './components/Footer'
import { Section } from './components/Section'

/* ---------------------------------------------------------------------------
   The page, top to bottom. One column, one CTA (the same button twice), no nav.

   Order is locked by the spec, and the order IS the argument:
     recognised (the headline names their week before it names the product)
     → shown (the demo does the arguing)
     → invited (the doors are open; one brass button)

   The .landing-doc wrapper is the boot gate's handle: public/boot-gate.js
   marks <html data-estate> before first paint and tokens.css hides this
   wrapper under it, so an estate holder never sees a landing frame while the
   app chunk loads. display:contents otherwise — it never affects layout.
--------------------------------------------------------------------------- */

export default function LandingPage() {
  return (
    <div className="landing-doc">
      {/* keyboard and screen-reader users get the door without the demo */}
      <a
        href="#enter"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-ember focus:px-4 focus:py-2 focus:font-display focus:text-sm focus:tracking-widest focus:text-bg"
      >
        {voice.a11y.skipToCta}
      </a>

      <Masthead />

      <main>
        <Hero />
        <BrassRule />

        {/* the instrument, in its recess, revealed by the first scroll */}
        <Section className="pt-10 md:pt-14">
          <Demo />
          <p className="mt-4 max-w-[740px] text-[12.5px] leading-relaxed text-pretty text-ink-dim italic md:text-[13.5px]">
            {voice.demo.caption}
          </p>
        </Section>

        <Wings />
        <WhatIf />
        <Briefing />
        <FounderNote />
        <Faq />
      </main>

      <Footer />
    </div>
  )
}
