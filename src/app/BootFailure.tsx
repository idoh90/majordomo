import { Component, type ErrorInfo, type ReactNode } from 'react'
import { serializeEstate, ESTATE_KEYS } from '../core/backup'

/**
 * The screen that runs when the app cannot.
 *
 * "Offline is the point" means the estate lives in localStorage and the app
 * boots from it SYNCHRONOUSLY — no async gate, no spinner, nothing between the
 * user and their own records. The cost of that choice is paid here: a store
 * whose blob is the wrong shape throws during the first render, and there is no
 * loading screen left to fail inside. What the user gets is a white page, and
 * every route back into the app is inside the app.
 *
 * So this component is deliberately SELF-CONTAINED. No voice pack, no skin
 * tokens, no shared primitives, no store reads — every one of those is a thing
 * that could be part of what just failed, and a recovery screen that can itself
 * fail is not one. Inline styles, inline copy, and the only import is the backup
 * serialiser, which reads localStorage directly and depends on no store.
 *
 * It offers exactly two things, in the order they should be done: take a copy of
 * whatever is still there, then clear the wing that will not load. Clearing is
 * the last resort and says so; the copy is offered first because a file on disk
 * is the only thing that survives the button below it.
 */

/**
 * What "clear this device and start again" clears.
 *
 * The estate, and ALSO the device-local bookkeeping beside it. That second
 * half was missing, and it made the button a broken promise: a poisoned sync
 * mailbox — an invitation code that threw when it was drawn, say — survived
 * the wipe, so the user destroyed every workout, event and venture they had
 * and the app still would not open. Anything that can stop the app booting has
 * to be inside the remedy for the app not booting.
 *
 * These are deliberately NOT part of the estate (they are not exported, and
 * one device's queue is meaningless on another), which is exactly why they had
 * to be named separately here.
 */
const KEYS: readonly string[] = [
  ...ESTATE_KEYS,
  'majordomo-sync',
  'majordomo-share',
  'majordomo-briefing',
]

const shell: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0c1017',
  color: '#e8ecf2',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  boxSizing: 'border-box',
}

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: '480px',
}

const button: React.CSSProperties = {
  width: '100%',
  padding: '12px 16px',
  marginTop: '10px',
  borderRadius: '8px',
  border: '1px solid #2b3442',
  background: '#151b25',
  color: '#e8ecf2',
  font: 'inherit',
  fontSize: '14px',
  cursor: 'pointer',
}

const danger: React.CSSProperties = {
  ...button,
  borderColor: '#5d2b2b',
  color: '#ff9b9b',
}

function download(): void {
  try {
    const blob = new Blob([serializeEstate()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `majordomo-estate-recovery-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    // Storage is refused or the blob is too large to serialise. Nothing to do
    // but leave the other button, which is why it is not the only one.
  }
}

function wipe(): void {
  for (const key of KEYS) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* blocked storage — there was nothing to clear */
    }
  }
  window.location.reload()
}

export function BootFailure({ detail }: { detail?: string }) {
  return (
    <div style={shell}>
      <div style={card}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 10px' }}>
          The estate did not open.
        </h1>
        <p style={{ fontSize: '14px', lineHeight: 1.55, margin: '0 0 6px', color: '#a8b2c1' }}>
          Something in the stored records is not the shape this app expects, so it stopped before
          drawing anything. Nothing has been deleted.
        </p>
        <p style={{ fontSize: '14px', lineHeight: 1.55, margin: '0 0 18px', color: '#a8b2c1' }}>
          Take a copy first. Clearing is the last resort, and it cannot be undone.
        </p>

        <button type="button" style={button} onClick={download}>
          Download a copy of what is here
        </button>
        <button type="button" style={button} onClick={() => window.location.reload()}>
          Try again
        </button>
        <button
          type="button"
          style={danger}
          onClick={() => {
            // Two deliberate acts, not one. `confirm` rather than the app's own
            // dialog for the same reason as everything else on this screen: it
            // cannot fail to render.
            if (window.confirm('Delete every record on this device? This cannot be undone.')) wipe()
          }}
        >
          Clear this device and start again
        </button>

        {detail && (
          <p
            style={{
              marginTop: '18px',
              fontSize: '11px',
              lineHeight: 1.5,
              color: '#6d7787',
              wordBreak: 'break-word',
            }}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Catches a throw from anywhere in the tree below it.
 *
 * This is the half that matters most in practice: a malformed blob does not
 * throw when it is rehydrated, it throws when a component finally maps over it —
 * which is to say during render, where only a boundary can hear it.
 *
 * What it deliberately does NOT catch is a throw during module evaluation: the
 * stores are created as a side effect of their own imports, and an ES import
 * runs before any statement in the file that imports it. Guarding that would
 * mean loading the app through a dynamic import, which is exactly the async boot
 * gate this project exists without. That gap is real and small: rehydration
 * stores what it is given rather than reading it.
 */
export class BootBoundary extends Component<{ children: ReactNode }, { failed: boolean; detail?: string }> {
  state = { failed: false, detail: undefined as string | undefined }

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, detail: error instanceof Error ? error.message : String(error) }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // The console is the only place the full trace belongs — the screen shows
    // one line, because a stack trace is not a remedy.
    console.error('[boot] the app failed to render:', error, info.componentStack)
  }

  render() {
    return this.state.failed ? <BootFailure detail={this.state.detail} /> : this.props.children
  }
}
