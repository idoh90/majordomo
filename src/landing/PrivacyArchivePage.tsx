import LegalPage from './LegalPage'
import { voice } from './voice'

/** the dates a superseded privacy policy is kept under — each is a route */
export type PrivacyArchiveDate = keyof typeof voice.privacyArchive

/* A superseded Privacy Policy, word for word, at the address of its own
   last-updated date (/privacy/2026-08-31). It exists so that "the version this
   replaced" in the current policy is a link and not a claim: a person who
   pressed AGREE & ENTER under the old terms can read exactly what they agreed
   to, and a regulator can too.

   Same LegalPage shell as the live documents, plus the one thing the archive
   adds — the notice under the title saying it no longer applies and where the
   current one is. Nothing else about it is different, and nothing in it is
   ever edited (see voice.ts, privacyArchive).

   Named like PrivacyPage for the same filesystem reason: the client entry
   beside it is entry-privacy-2026-08-31.tsx. */
export default function PrivacyArchivePage({ date }: { date: PrivacyArchiveDate }) {
  return <LegalPage doc={voice.privacyArchive[date]} />
}
