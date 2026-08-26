import { voice } from './voice'

type LegalDoc = {
  title: string
  back: string
  updated: string
  sections: ReadonlyArray<{ h: string; p: ReadonlyArray<string> }>
}

/* The shared shell of /privacy and /terms — extracted the day the second
   document arrived. Sectioned rather than flat paragraphs: these are now real
   documents, and a wall of ungrouped prose is where careful readers give up. */
export default function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <main className="mx-auto max-w-[640px] px-5 py-16 sm:px-8 md:py-24">
      <a
        href="/"
        className="font-display text-[11px] font-semibold tracking-[0.24em] text-ink-dim underline-offset-4 hover:text-ink hover:underline"
      >
        ← {doc.back.toUpperCase()}
      </a>

      <h1 className="mt-8 font-display text-[34px] leading-none font-bold tracking-[0.06em] text-ink md:text-[44px]">
        {doc.title.toUpperCase()}
      </h1>

      {doc.sections.map((s) => (
        <section key={s.h} className="mt-10">
          <h2 className="font-display text-[13px] font-semibold tracking-[0.18em] text-ink uppercase">
            {s.h}
          </h2>
          <div className="mt-3 space-y-4">
            {s.p.map((p) => (
              <p key={p} className="text-[15.5px] leading-relaxed text-pretty text-ink-dim">
                {p}
              </p>
            ))}
          </div>
        </section>
      ))}

      {/* ink-dim, not ink-faint: at this size ink-faint misses the page's own
          AA criterion (see the .card-title note in tokens.css) */}
      <p className="mt-12 text-[12px] text-ink-dim">{doc.updated}</p>
      <p className="mt-2 text-[12px] text-ink-dim">{voice.footer.legal}</p>
    </main>
  )
}
