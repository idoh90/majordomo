import { voice } from '../voice'
import { Section, SectionHeading } from './Section'

/* ---------------------------------------------------------------------------
   The Wings — three panels, one sentence each, one real screenshot each.

   Screenshot policy, and it is not negotiable: real app screens only, shot
   from the app's own `?demo` fixtures at 2×. Never a mocked feature. The beta
   testers land in the real app weeks after seeing this page and they remember.
   `npm run shots` regenerates them; scripts/shoot.mjs is the recipe.

   The wing accent colours live in here and nowhere else on the page — inside
   product imagery, as data. That is the whole palette doctrine in one section.
--------------------------------------------------------------------------- */

const ACCENT: Record<string, string> = {
  watch: 'var(--color-w-watch)',
  grounds: 'var(--color-w-grounds)',
  study: 'var(--color-w-study)',
}

/* Which part of each screen the crop should hold. Every wing screenshot is a
   whole 390×844 phone, and the top of a phone is a header — the same header on
   all three. The instrument is what differentiates them, so the crop lands on
   the duty ring, the body map and the subject rings respectively. */
const FOCUS: Record<string, string> = {
  watch: '70%',
  grounds: '88%',
  study: '86%',
}

export default function Wings() {
  return (
    <Section className="pt-20 md:pt-32">
      <SectionHeading title={voice.wings.title} kicker={voice.wings.kicker} />

      <ul className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
        {voice.wings.items.map((wing) => (
          <li key={wing.id} className="panel flex flex-col overflow-hidden">
            <div className="px-5 pt-5 pb-4 md:px-6 md:pt-6">
              {/* The name sets in ink, not in the wing's colour. The doctrine
                  is not decorative: wing accents live INSIDE product imagery,
                  as data, and the moment they colour a heading they are page
                  chrome competing with the one brass word. The screenshot
                  below carries the wing's colour, vividly, where it means
                  something. The rule above the name is that colour's only
                  appearance in the panel's furniture — a hairline, not a
                  voice. */}
              <span
                className="mb-3 block h-px w-8"
                style={{ background: ACCENT[wing.id], opacity: 0.55 }}
              />
              <h3 className="font-display text-[15px] font-bold tracking-[0.22em] text-ink">
                {wing.name}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-pretty text-ink-dim">
                {wing.line}
              </p>
            </div>

            {/* the screen itself, cropped to its top — a phone-shaped frame,
                because that is the shape this page is read in */}
            <div className="trough relative mx-4 mb-4 h-[280px] overflow-hidden md:mx-5 md:mb-5 md:h-[320px]">
              <img
                src={`/shots/${wing.id}.webp`}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                width={780}
                height={1688}
                className="h-full w-full object-cover"
                style={{ objectPosition: `50% ${FOCUS[wing.id]}` }}
              />
              {/* Both edges fade, not just the bottom. The crop lands mid-screen
                  by design, so it can cut a line of text at the TOP as easily as
                  the bottom — and a half-line at a hard edge reads as a broken
                  image rather than a screen continuing. */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(180deg, color-mix(in srgb, var(--color-bg) 85%, transparent) 0%, transparent 14%, transparent 58%, color-mix(in srgb, var(--color-bg) 92%, transparent) 100%)',
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}
