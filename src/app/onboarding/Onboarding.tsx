import { InstallStage } from '../install/InstallStage'
import { SetupPanel } from './SetupPanel'
import { WalkCard } from './WalkCard'
import { WelcomeStage } from './WelcomeStage'
import { useOnboarding } from './store'

/**
 * The first-time setup's one mount point, hung beside the login screen in
 * App.tsx — the same shape as that door: it renders nothing at all until
 * something asks for it, so the app boots from localStorage exactly as before
 * and nothing waits on this.
 */
export function Onboarding() {
  const stage = useOnboarding((s) => s.stage)
  if (!stage) return null

  if (
    stage === 'welcome' ||
    stage === 'registry' ||
    stage === 'welcomeBack' ||
    stage === 'intro' ||
    stage === 'composition'
  ) {
    return <WelcomeStage stage={stage} />
  }
  if (
    stage === 'work' ||
    stage === 'training' ||
    stage === 'study' ||
    stage === 'workshop' ||
    stage === 'preset'
  ) {
    return <SetupPanel stage={stage} />
  }
  if (stage === 'install') return <InstallStage />
  return <WalkCard stage={stage} />
}
