import { voice } from '../voice'
import { Section, SectionHeading } from './Section'

/* ---------------------------------------------------------------------------
   The price list — standing on a page that cannot take money yet.

   THERE IS NO BUTTON IN THIS SECTION, and that is the design, not an omission.
   The page has exactly one call to action and it is the door (GetStarted, twice
   — hero and footer). A second button here would either lead to a checkout that
   does not exist or lead nowhere at all, and the second is worse than the first.
   When Paddle is wired, the buy control belongs in this section and the fine
   print below it stops being a promise and starts being a receipt.

   Two things are load-bearing about the way it looks:

   1. NEITHER CARD IS INFLATED. No scale-up on the paid one, no "most popular"
      badge, no crossed-out anchor price. Nothing is for sale, so there is
      nothing to steer a reader toward; and with zero customers, "popular" would
      be a fabricated number, which the evidence rules forbid outright.
   2. BRASS STAYS THE DOOR'S COLOUR. The page's palette doctrine allows brass
      three places — the CTA, the word MAJORDOMO, one hairline rule — so the
      prices set in ink and Full Staff's brass appears only as the 8px hairline
      above its name, exactly the way a wing's accent appears in Wings.tsx: a
      hairline, not a voice. A brass price would read as a button and promise a
      purchase this page cannot honour.

   Feature rows are hairline-separated, never a column of ticks. A tick means
   "included" and needs its own opposite to mean anything; a manifest of what
   the house does needs no punctuation at all.
--------------------------------------------------------------------------- */

/* Manor's rule is furniture; Full Staff's is the page's accent, at hairline
   weight. `ink-faint` is legal here and nowhere near text — it fails AA at
   body size, which is why card-title sits in ink-dim (see tokens.css). */
const RULE: Record<string, string> = {
  manor: 'var(--color-ink-faint)',
  staff: 'var(--color-ember)',
}

export default function Pricing() {
  const p = voice.pricing

  return (
    <Section id="terms" className="pt-20 md:pt-32">
      <SectionHeading title={p.title} kicker={p.kicker} />

      <ul className="grid gap-4 sm:grid-cols-2 md:gap-6">
        {p.tiers.map((tier) => (
          <li key={tier.id} className="panel flex flex-col p-5 md:p-6">
            <span
              className="mb-3 block h-px w-8"
              style={{ background: RULE[tier.id], opacity: 0.55 }}
            />
            <h3 className="font-display text-[15px] font-bold tracking-[0.22em] text-ink">
              {tier.name}
            </h3>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-pretty text-ink-dim">
              {tier.line}
            </p>

            {/* the figure gets the app's own stat treatment — display face,
                tabular numerals, set in ink so it reads as a fact rather than
                as something to press */}
            <p className="mt-6 font-display text-[40px] leading-none font-semibold tabular-nums text-ink md:text-[44px]">
              {tier.price}
            </p>
            <p className="mt-2 text-[13px] text-ink-dim">{tier.period}</p>

            <ul className="mt-6">
              {tier.items.map((item) => (
                <li
                  key={item.text}
                  className="flex items-baseline gap-3 border-t border-line py-3 text-[14px] leading-relaxed text-pretty text-ink-dim"
                >
                  <span className="flex-1">{item.text}</span>
                  {item.pending && (
                    <>
                      <span
                        aria-hidden="true"
                        className="shrink-0 rounded-pill border border-line px-2 py-0.5 font-display text-[9.5px] font-bold tracking-[0.14em] text-ink-dim"
                      >
                        {p.pending}
                      </span>
                      {/* the pill is four characters; a screen reader gets the
                          whole phrase instead of an abbreviation */}
                      <span className="sr-only">{p.pendingLabel}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {/* Not a third tier — the same full staff, bought once — so it is laid
          out as a line rather than a card, and carries no hairline of its own. */}
      <div className="panel mt-4 flex flex-col gap-3 p-5 md:mt-6 md:flex-row md:items-baseline md:gap-8 md:p-6">
        <div className="flex items-baseline gap-3 md:shrink-0">
          <h3 className="font-display text-[15px] font-bold tracking-[0.22em] text-ink">
            {p.founders.name}
          </h3>
          <span className="font-display text-[15px] font-semibold tabular-nums text-ink-dim">
            {p.founders.terms}
          </span>
        </div>
        <p className="max-w-[560px] text-[14px] leading-relaxed text-pretty text-ink-dim">
          {p.founders.line}
        </p>
      </div>

      <p className="mt-6 max-w-[740px] text-[12.5px] leading-relaxed text-pretty text-ink-dim italic md:text-[13.5px]">
        {p.note}
      </p>
    </Section>
  )
}
