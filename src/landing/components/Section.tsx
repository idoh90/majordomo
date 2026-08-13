import type { ReactNode } from 'react'

/* One rhythm for every section below the fold: a tracked all-caps title in the
   display face, a kicker in body text, and the content. Sections are separated
   by air, not by rules — the page has exactly one rule and it is brass. */
export function SectionHeading({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div className="mb-7 md:mb-10">
      <h2 className="font-display text-[22px] leading-none font-semibold tracking-[0.16em] text-ink sm:text-[26px] md:text-[30px] md:tracking-[0.18em]">
        {title}
      </h2>
      {kicker && <p className="mt-2.5 text-[14px] text-ink-dim md:text-[15px]">{kicker}</p>}
    </div>
  )
}

export function Section({
  children,
  className = '',
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={`mx-auto max-w-[1100px] px-5 sm:px-8 ${className}`}>
      {children}
    </section>
  )
}
