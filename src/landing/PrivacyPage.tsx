import LegalPage from './LegalPage'
import { voice } from './voice'

/* One honest section per thing collected, and the deletion route stated
   without a retention offer attached to it. An estate does not gossip.

   Named PrivacyPage, not Privacy: the client entry beside it is
   entry-privacy.tsx, and on a case-insensitive filesystem those are the same
   file. */
export default function PrivacyPage() {
  return <LegalPage doc={voice.privacy} />
}
