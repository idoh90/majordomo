import { voice } from './voice'

/* ---------------------------------------------------------------------------
   404 — the page that unknown routes meet.

   Branded and deliberate: no Vercel request ids, no deployment ids, no docs
   links. Dry butler register matching the landing and the legal pages —
   composed, one sentence, understated. The user made a wrong turn; the app
   does not make a drama of it.
--------------------------------------------------------------------------- */
export default function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center px-5 py-16 text-center sm:px-8">
      <div className="space-y-6">
        <h1 className="font-display text-[80px] font-bold leading-none tracking-[0.06em] text-ink md:text-[120px]">
          404
        </h1>

        <div className="space-y-3">
          <p className="font-display text-[18px] font-semibold tracking-[0.08em] text-ink md:text-[22px]">
            {voice.notFound.title.toUpperCase()}
          </p>
          <p className="text-[15.5px] leading-relaxed text-ink-dim">{voice.notFound.body}</p>
        </div>

        <div className="pt-4">
          <a
            href="/"
            className="inline-block rounded-full bg-brass px-6 py-3 font-display text-[13px] font-semibold tracking-[0.12em] text-slate-950 transition-all hover:bg-brass-bright active:scale-95"
          >
            {voice.notFound.cta.toUpperCase()}
          </a>
        </div>
      </div>

      <p className="mt-16 text-[12px] text-ink-dim">{voice.footer.legal}</p>
    </main>
  )
}
