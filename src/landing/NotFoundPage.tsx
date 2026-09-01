import { voice } from './voice'

/* ---------------------------------------------------------------------------
   The wrong address.

   Vercel serves dist/404.html at every path the deployment does not have, with
   a real 404 status — no rewrite, no router, no 200 pretending to be an error.
   Before this page existed that was the platform's own black NOT_FOUND card:
   the one screen a stranger could reach that did not look like the product.

   Deliberately NOT built on LegalPage. That shell is a document — a long
   column of sectioned prose with a reading rhythm. This is a dead end, and the
   only useful thing on it is the way out, so it is short, centred, and holds
   one link.

   Deterministic on first render, like every other prerendered page here: it
   reads no window, no storage and no URL. It cannot say whether the visitor
   holds an estate, and does not try — "/" answers that question correctly for
   both, because the boot gate is what decides it.
--------------------------------------------------------------------------- */
export default function NotFoundPage() {
  const doc = voice.notFound

  return (
    <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col justify-center px-5 py-16 sm:px-8">
      {/* brass, and the only brass on the page — the accent means "this is the
          thing that happened", the same way it means "this is the way in" on
          the landing's CTA */}
      <p className="font-display text-[64px] leading-none font-bold tracking-[0.06em] text-ember md:text-[80px]">
        {doc.code}
      </p>

      <h1 className="mt-4 font-display text-[30px] leading-none font-bold tracking-[0.06em] text-ink md:text-[38px]">
        {doc.title.toUpperCase()}
      </h1>

      <div className="mt-6 space-y-4">
        {doc.body.map((p) => (
          <p key={p} className="text-[15.5px] leading-relaxed text-pretty text-ink-dim">
            {p}
          </p>
        ))}
      </div>

      {/* An <a> to a real document, not a history push: there is no router
          here, and this page is often the first thing a browser loaded. */}
      <p className="mt-10">
        <a
          href="/"
          className="font-display text-[11px] font-semibold tracking-[0.24em] text-ink underline-offset-4 hover:text-ember hover:underline"
        >
          ← {doc.back.toUpperCase()}
        </a>
      </p>

      {/* The stranded visitor's other doors. Same strings as the landing's
          footer — a 404 is not the place to invent a second vocabulary. */}
      <p className="mt-12 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-dim">
        <a href="/privacy" className="underline-offset-4 hover:text-ink hover:underline">
          {voice.footer.privacy}
        </a>
        <a href="/terms" className="underline-offset-4 hover:text-ink hover:underline">
          {voice.footer.terms}
        </a>
        <a
          href={voice.footer.contactHref}
          className="underline-offset-4 hover:text-ink hover:underline"
        >
          {voice.footer.contact}
        </a>
      </p>
      <p className="mt-2 text-[12px] text-ink-dim">{voice.footer.legal}</p>
    </main>
  )
}
