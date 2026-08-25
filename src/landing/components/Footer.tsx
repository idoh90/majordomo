import { voice } from '../voice'
import GetStarted from './GetStarted'
import { Section } from './Section'

/* The second CTA. Many visitors read the whole page and convert at the bottom;
   making them scroll back up to a form they have already passed is a tax on
   the most convinced person on the page. Same form, same strings, same one
   field. */
export default function Footer() {
  return (
    <footer className="pt-20 pb-14 md:pt-32 md:pb-20">
      <Section>
        <div className="mx-auto max-w-[560px] text-center">
          <p className="mb-6 font-display text-[19px] leading-tight font-semibold tracking-[0.1em] text-ink sm:text-[22px]">
            {voice.hero.headlineLead}{' '}
            <span className="text-ember">{voice.hero.headlineWord}</span>
            <span className="font-body text-ink">.</span>
          </p>

          <GetStarted placement="footer" />

          <p className="mt-9 text-[13px] text-ink-dim">{voice.footer.signoff}</p>

          <p className="mt-3 text-[12px] text-ink-dim">
            {voice.footer.legal}
            <span className="px-1.5">·</span>
            <a href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
              {voice.footer.privacy}
            </a>
            <span className="px-1.5">·</span>
            <a href="/terms" className="underline-offset-4 hover:text-ink hover:underline">
              {voice.footer.terms}
            </a>
            <span className="px-1.5">·</span>
            <a
              href={voice.footer.contactHref}
              className="underline-offset-4 hover:text-ink hover:underline"
            >
              {voice.footer.contact}
            </a>
          </p>
        </div>
      </Section>
    </footer>
  )
}
