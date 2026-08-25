import LegalPage from './LegalPage'
import { voice } from './voice'

/* Named TermsPage for the same reason PrivacyPage is: the client entry beside
   it is entry-terms.tsx, and a case-insensitive filesystem must never see two
   spellings of one name. */
export default function TermsPage() {
  return <LegalPage doc={voice.terms} />
}
