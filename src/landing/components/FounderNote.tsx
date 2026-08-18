import { voice } from '../voice'
import { Section } from './Section'

/* A letter, not a card. It sits on the page background with nothing around it,
   because a panel would make it marketing. Until the signup count is honestly
   respectable, this paragraph IS the social proof: built by one of you. */
export default function FounderNote() {
  return (
    <Section className="pt-20 md:pt-32">
      <div className="max-w-[640px]">
        <p className="text-[17px] leading-[1.65] text-pretty text-ink md:text-[19px]">
          {voice.founder.body}
        </p>
        <p className="mt-5 text-[14px] text-ink-dim">
          {voice.founder.signature}
          {/* the separator belongs to the links, not to the signature — with no
              handles yet the line has to end after "in public", not after a
              dangling middle dot */}
          {voice.founder.links.length > 0 && ' · '}
          {voice.founder.links.map((link, i) => (
            <span key={link.label}>
              {i > 0 && <span className="text-ink-dim"> · </span>}
              {/* ink, not brass. Brass owns the word MAJORDOMO, the CTA and
                  the fold rule — three places, and every extra one costs the
                  first two some of their weight. A link reads as a link from
                  its underline. */}
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer me"
                className="text-ink underline decoration-ink-faint underline-offset-4 transition-colors hover:decoration-ink"
              >
                {link.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </Section>
  )
}
