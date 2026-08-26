import { voice } from '../voice'
import { Section, SectionHeading } from './Section'
import './faq.css'

/* ---------------------------------------------------------------------------
   Five questions, two-sentence answers.

   Native <details>/<summary>. No accordion library, no JS: it opens without
   hydration, it is keyboard-operable for free, and the browser's own find-in-
   page can open a closed answer. The chevron is a CSS rotation on the marker.

   The page behaves like the butler here — it anticipates the question instead
   of waiting to be asked.
--------------------------------------------------------------------------- */

export default function Faq() {
  return (
    <Section className="pt-20 md:pt-32">
      <SectionHeading title={voice.faq.title} />
      <div className="max-w-[760px]">
        {voice.faq.items.map((item) => (
          <details key={item.q} className="faq panel mb-2.5 px-5 py-0.5 md:px-6">
            <summary className="flex cursor-pointer list-none items-center gap-4 py-4 text-[15.5px] text-ink select-none md:text-[17px]">
              <span className="flex-1">{item.q}</span>
              <svg
                className="faq-chevron h-3.5 w-3.5 shrink-0 text-ink-faint"
                viewBox="0 0 14 14"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3.5 5.25 7 8.75l3.5-3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <p className="pb-4 text-[14.5px] leading-relaxed text-pretty text-ink-dim md:text-[15.5px]">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  )
}
