import { voice } from './voice'

/** a link threaded through a paragraph — the only markup a legal document
 *  carries, and the reason paragraphs are segments rather than strings */
export type LegalLink = { text: string; href: string }
/** plain prose, or prose with links in it */
export type LegalPara = string | ReadonlyArray<string | LegalLink>

type LegalDoc = {
  title: string
  back: string
  updated: string
  /** a superseded version's standing notice — only the archive sets it */
  notice?: LegalPara
  sections: ReadonlyArray<{ h: string; p: ReadonlyArray<LegalPara> }>
}

/* Off-site links open in a new tab and carry no referrer: the reader is
   leaving to check what a third party promises, and should not lose their
   place here (or hand the address they came from) to do it. Same-site links
   are ordinary navigations. */
function Segment({ seg }: { seg: string | LegalLink }) {
  if (typeof seg === 'string') return <>{seg}</>
  const external = /^https?:\/\//.test(seg.href)
  return (
    <a
      href={seg.href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="text-ink underline underline-offset-4 hover:text-ember"
    >
      {seg.text}
    </a>
  )
}

function Prose({ p }: { p: LegalPara }) {
  if (typeof p === 'string') return <>{p}</>
  return (
    <>
      {p.map((seg, i) => (
        <Segment key={i} seg={seg} />
      ))}
    </>
  )
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

      {/* The archive's one addition to the document it preserves: brass rule,
          full ink, above the first section — a reader who arrived from a
          search or an old link must learn in the first line that this is not
          the policy that applies. */}
      {doc.notice && (
        <p className="mt-8 border-l-2 border-ember pl-4 text-[15px] leading-relaxed text-ink">
          <Prose p={doc.notice} />
        </p>
      )}

      {doc.sections.map((s) => (
        <section key={s.h} className="mt-10">
          <h2 className="font-display text-[13px] font-semibold tracking-[0.18em] text-ink uppercase">
            {s.h}
          </h2>
          <div className="mt-3 space-y-4">
            {s.p.map((p, i) => (
              <p key={i} className="text-[15.5px] leading-relaxed text-pretty text-ink-dim">
                <Prose p={p} />
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
