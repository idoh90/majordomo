import { voice } from './voice'

/* One honest paragraph per thing collected, and the deletion route stated
   without a retention offer attached to it. An estate does not gossip.

   Named PrivacyPage, not Privacy: the client entry beside it is privacy.tsx,
   and on a case-insensitive filesystem those are the same file. */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-[640px] px-5 py-16 sm:px-8 md:py-24">
      <a
        href="/"
        className="font-display text-[11px] font-semibold tracking-[0.24em] text-ink-dim underline-offset-4 hover:text-ink hover:underline"
      >
        ← {voice.privacy.back.toUpperCase()}
      </a>

      <h1 className="mt-8 font-display text-[34px] leading-none font-bold tracking-[0.06em] text-ink md:text-[44px]">
        {voice.privacy.title.toUpperCase()}
      </h1>

      <div className="mt-7 space-y-5">
        {voice.privacy.body.map((p) => (
          <p key={p} className="text-[15.5px] leading-relaxed text-pretty text-ink-dim">
            {p}
          </p>
        ))}
      </div>

      <p className="mt-12 text-[12px] text-ink-dim">{voice.footer.legal}</p>
    </main>
  )
}
