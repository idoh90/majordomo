import { useEffect, useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import { announceName } from '../../modules/workshop/share'
import { useShellStore } from '../../core/store/shell'
import { useShareStore } from '../../core/sync/shareStore'
import { Sheet } from '../../core/ui/Sheet'
import { voice } from '../../core/voice'
import { formatCode } from '../../modules/workshop/joinCode'
import { useAuthUi } from '../authUi'

/**
 * THE INVITATION — what a `?join=` link opens now.
 *
 * It used to open nothing. The code went into the redeem mailbox and the sync
 * loop joined the crew on its next cycle, so following a link WAS joining: the
 * board landed on your shelf, your name landed on a roster four strangers can
 * read, and you were told none of it beforehand. A link forwarded into a group
 * chat enrolled whoever tapped it.
 *
 * So this asks. It states what accepting does in both directions — their work
 * arrives, yours joins their books — it shows the NAME the crew will see, and
 * it makes that name editable right here, because the moment someone is about
 * to be introduced is the moment to ask what to call them.
 *
 * NOT NOW is a real answer and leaves nothing behind.
 *
 * Sign-in comes AFTER accepting, never before: being asked to hand over an
 * account before being told what for is the wall this house does not put up.
 */
export function InviteDoor() {
  const invite = useShareStore((s) => s.invite)
  const pendingJoin = useShareStore((s) => s.pendingJoin)
  const applications = useShareStore((s) => s.applications)
  const lastError = useShareStore((s) => s.lastError)
  const signedIn = useAuthStore((s) => s.status) === 'signedIn'

  const [name, setName] = useState('')
  const [stage, setStage] = useState<'offer' | 'working' | 'done'>('offer')
  const [said, setSaid] = useState('')
  /** how many applications stood before we knocked — see the crew room's twin */
  const [lodgedBefore, setLodgedBefore] = useState(0)

  const c = voice.workshop.crew
  const t = c.invite

  // a fresh offer resets the door, and seeds the field with whatever name this
  // device already answers to
  useEffect(() => {
    if (!invite) return
    setStage('offer')
    setSaid('')
    setName(useShellStore.getState().crewName)
  }, [invite])

  // accepted and in flight: the mailbox clearing is the service's answer
  useEffect(() => {
    if (stage !== 'working' || pendingJoin !== null) return
    if (lastError) {
      setSaid(t.failed)
    } else {
      setSaid(Object.keys(applications).length > lodgedBefore ? t.applied : t.joined)
    }
    setStage('done')
  }, [stage, pendingJoin, lastError, applications, lodgedBefore, t])

  if (!invite && stage === 'offer') return null

  const close = () => {
    useShareStore.getState().setInvite(null)
    setStage('offer')
  }

  const accept = () => {
    const chosen = name.trim()
    if (!chosen) return
    // The field asks about THIS crew and writes the device's name for ALL of
    // them, which is the honest simplification — but the other two rename
    // sites announce, and this one did not. So a name typed for one incoming
    // crew became what settings claimed every crew saw, while every existing
    // roster still showed the old one; and the next save anywhere pushed it
    // to crews the user had deliberately kept under another name.
    useShellStore.getState().setCrewName(chosen)
    void announceName()
    setLodgedBefore(Object.keys(useShareStore.getState().applications).length)
    useShareStore.getState().setError(null)
    useShareStore.getState().setPendingJoin(invite ?? '')
    useShareStore.getState().setInvite(null)
    if (signedIn) {
      setStage('working')
      return
    }
    /**
     * Accepted while signed out. The door SHUTS and the sign-in screen opens —
     * it does not stay up behind it. Both live at z-50, so a sheet left
     * standing would simply cover the thing it just sent the user to.
     *
     * The explanation goes with the sign-in screen instead, which reads the
     * same held code and says why it is asking (`toast.linkHeld`). The code is
     * persisted, so it survives the OAuth round trip and the redirect that
     * follows; the service redeems once a session lands.
     */
    setStage('offer')
    useAuthUi.getState().setOpen(true)
  }

  const offering = stage === 'offer'

  return (
    <Sheet open onClose={close}>
      <h2 className="card-title">{t.title}</h2>

      {offering ? (
        <>
          <div className="stat-num mt-3 font-display text-[22px] font-semibold tracking-[0.14em]">
            {formatCode(invite ?? '')}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink-dim">{t.blurb}</p>

          <div className="mt-5">
            <div className="text-[9px] tracking-[0.18em] text-ink-faint">{c.nameTitle}</div>
            <p className="mt-1.5 text-[12.5px] leading-snug text-ink-dim">{t.seen}</p>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') accept()
              }}
              placeholder={c.namePlaceholder}
              maxLength={40}
              autoCorrect="off"
              spellCheck={false}
              aria-label={c.nameTitle}
              className="mt-2 w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-accent"
            />
          </div>

          <button
            type="button"
            disabled={!name.trim()}
            onClick={accept}
            className="btn-cta mt-5 w-full py-3.5 text-sm disabled:opacity-40"
          >
            {t.accept}
          </button>
          <button
            type="button"
            onClick={close}
            className="mx-auto mt-3 flex min-h-11 items-center text-[12.5px] text-ink-faint transition-colors hover:text-ink-dim"
          >
            {t.decline}
          </button>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm leading-relaxed text-ink">
            {stage === 'working' ? t.working : said}
          </p>
          {stage !== 'working' && (
            <button type="button" onClick={close} className="btn-soft mt-5 w-full py-3 text-sm">
              {t.close}
            </button>
          )}
        </>
      )}
    </Sheet>
  )
}
