import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import { useShellStore } from '../../core/store/shell'
import { offReason } from '../../core/sync/gate'
import { useShareStore } from '../../core/sync/shareStore'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { Sheet } from '../../core/ui/Sheet'
import { useNow } from '../../core/useNow'
import { voice } from '../../core/voice'
import { memberContribution } from './lib'
import { disbandCrew, joinCrew, leaveCrew, removeMember, shareVenture } from './share'
import { useWorkshopStore } from './store'
import type { Venture } from './types'

/**
 * The crew doors: the ShareSheet (open a venture to a crew, show the code,
 * the roster, the contribution table, the leaving doors) and the JoinSheet
 * (type a code). Both live behind `armed()` — a demo'd or storage-less device
 * never shows them — and both commit every act immediately, so neither ever
 * needs the dirty-guard.
 */

const fmtCode = (code: string) =>
  code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => {})
}

type Confirming =
  | { kind: 'kick'; userId: string; label: string }
  | { kind: 'leave' }
  | { kind: 'disband' }
  | { kind: 'delete' }
  | null

export function ShareSheet({
  venture,
  open,
  onClose,
  butler,
}: {
  venture: Venture
  open: boolean
  onClose: () => void
  butler: (msg: string) => void
}) {
  const me = useAuthStore((s) => s.userId)
  const authStatus = useAuthStore((s) => s.status)
  const members = useWorkshopStore((s) => s.members)
  const workEntries = useWorkshopStore((s) => s.workEntries)
  const cards = useWorkshopStore((s) => s.cards)
  const deleteVenture = useWorkshopStore((s) => s.deleteVenture)
  const codes = useShareStore((s) => s.codes)
  const owners = useShareStore((s) => s.owners)
  const lastError = useShareStore((s) => s.lastError)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const [working, setWorking] = useState(false)
  const [confirming, setConfirming] = useState<Confirming>(null)

  const c = voice.workshop.crew
  const shareId = venture.shareId ?? null
  const roster = shareId ? (members[shareId] ?? []) : []
  const code = shareId ? codes[shareId] : undefined
  const isOwner = shareId ? owners[shareId] === me && me !== null : false
  const contribution = shareId
    ? memberContribution(venture.id, roster, workEntries, cards, now, weekStart)
    : []

  const run = async (act: () => Promise<{ ok: boolean; reason?: string }>, said: string) => {
    setWorking(true)
    const res = await act()
    setWorking(false)
    setConfirming(null)
    if (res.ok) {
      butler(said)
      return true
    }
    butler(res.reason ?? c.toast.offline)
    return false
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{c.sheetTitle}</h2>
      <div className="mt-1 font-display text-[15px] font-bold uppercase tracking-[0.08em]">
        {venture.name}
      </div>

      {!shareId ? (
        <>
          <p className="mt-3 text-sm text-ink-dim">{c.blurb}</p>
          <button
            type="button"
            disabled={working}
            onClick={() => {
              void run(() => shareVenture(venture.id), c.toast.shared)
            }}
            className="btn-cta mt-5 w-full py-3 text-sm"
          >
            {working ? c.creating : c.cta}
          </button>
          {authStatus !== 'signedIn' && (
            <p className="mt-3 text-[12px] text-ink-faint">{c.toast.needsSignIn}</p>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-ink-dim">{c.blurbCrewed}</p>

          {/* ------------------------------------------------ the code */}
          <div className="mt-4 rounded-xl border border-line bg-panel-2 px-4 py-3.5">
            <div className="text-[9px] tracking-[0.18em] text-ink-faint">{c.codeLabel}</div>
            <div className="stat-num mt-1 font-display text-[26px] font-semibold tracking-[0.14em]">
              {code ? fmtCode(code) : '····-····'}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!code}
                onClick={() => {
                  if (!code) return
                  copyText(code)
                  butler(c.copied)
                }}
                className="btn-soft flex-1 py-2 text-[11px] tracking-[0.1em]"
              >
                {c.copyCode}
              </button>
              <button
                type="button"
                disabled={!code}
                onClick={() => {
                  if (!code) return
                  copyText(`${window.location.origin}/?join=${code}`)
                  butler(c.copied)
                }}
                className="btn-soft flex-1 py-2 text-[11px] tracking-[0.1em]"
              >
                {c.copyLink}
              </button>
            </div>
          </div>

          {/* ---------------------------------------------- the roster */}
          <div className="mt-5">
            <div className="text-[9px] tracking-[0.18em] text-ink-faint">{c.rosterTitle}</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {roster.map((m) => (
                <div key={m.userId} className="flex items-center gap-2 text-sm">
                  <span className="h-1.5 w-1.5 rotate-45 bg-accent" aria-hidden />
                  <span className="flex-1">
                    {m.label}
                    {m.userId === me && (
                      <span className="ml-1.5 text-[11px] text-ink-faint">· {c.you}</span>
                    )}
                    {shareId && owners[shareId] === m.userId && (
                      <span className="ml-1.5 text-[11px] text-ink-faint">· {c.owner}</span>
                    )}
                  </span>
                  {isOwner && m.userId !== me && (
                    <button
                      type="button"
                      onClick={() => setConfirming({ kind: 'kick', userId: m.userId, label: m.label })}
                      className="text-[10px] tracking-[0.12em] text-ink-faint transition-colors hover:text-danger"
                    >
                      {c.kick}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---------------------------------------- the contribution */}
          {contribution.length > 0 && (
            <div className="mt-5">
              <div className="text-[9px] tracking-[0.18em] text-ink-faint">
                {c.contributionTitle}
              </div>
              <div className="mt-2 flex flex-col gap-2">
                {contribution.map((row) => (
                  <div
                    key={row.userId}
                    className="rounded-xl border border-line bg-panel-2 px-3.5 py-2.5"
                  >
                    <div className="text-[13px] font-semibold">
                      {row.label}
                      {row.userId === me && (
                        <span className="ml-1.5 text-[11px] font-normal text-ink-faint">
                          · {c.you}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-ink-dim [font-variant-numeric:tabular-nums]">
                      <span>{c.weekH(row.weekH)}</span>
                      <span>{c.totalH(row.totalH)}</span>
                      <span>{c.tasksDone(row.tasksDone)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {lastError && <p className="mt-4 text-[12px] text-danger">{c.errorLine(lastError)}</p>}

          {/* ----------------------------------------- the leaving doors */}
          <div className="mt-6 flex flex-col gap-2">
            {isOwner ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: 'disband' })}
                  className="btn-soft w-full py-2.5 text-[11px] tracking-[0.1em]"
                >
                  {c.unshare}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: 'delete' })}
                  className="w-full py-1.5 text-[10px] tracking-[0.12em] text-ink-faint transition-colors hover:text-danger"
                >
                  {c.deleteTitle.toUpperCase()}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming({ kind: 'leave' })}
                className="btn-soft w-full py-2.5 text-[11px] tracking-[0.1em]"
              >
                {c.leave}
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirming?.kind === 'kick'}
        title={c.kickTitle}
        message={confirming?.kind === 'kick' ? c.kickBody(confirming.label) : undefined}
        confirmLabel={c.kickYes}
        onConfirm={() => {
          if (confirming?.kind !== 'kick' || !shareId) return
          void run(() => removeMember(shareId, confirming.userId), c.toast.kicked)
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'leave'}
        title={c.leaveTitle}
        message={c.leaveBody}
        confirmLabel={c.leaveYes}
        onConfirm={() => {
          void run(() => leaveCrew(venture.id), c.toast.left).then((ok) => {
            if (ok) onClose()
          })
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'disband'}
        title={c.unshareTitle}
        message={c.unshareBody}
        confirmLabel={c.unshareYes}
        onConfirm={() => {
          void run(() => disbandCrew(venture.id), c.toast.unshared).then((ok) => {
            if (ok) onClose()
          })
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'delete'}
        title={c.deleteTitle}
        message={c.deleteBody(venture.name)}
        confirmLabel={c.deleteYes}
        onConfirm={() => {
          deleteVenture(venture.id)
          setConfirming(null)
          onClose()
        }}
        onCancel={() => setConfirming(null)}
      />
    </Sheet>
  )
}

/* -------------------------------------------------------------- join door */

export function JoinSheet({
  open,
  onClose,
  butler,
}: {
  open: boolean
  onClose: () => void
  butler: (msg: string) => void
}) {
  const [code, setCode] = useState('')
  const pendingJoin = useShareStore((s) => s.pendingJoin)
  const lastError = useShareStore((s) => s.lastError)
  const c = voice.workshop.crew

  // once submitted, watch the mailbox: cleared without an error means the
  // service redeemed it and the venture is on its way down
  const submitted = useRef(false)
  useEffect(() => {
    if (!submitted.current) return
    if (pendingJoin === null) {
      submitted.current = false
      if (lastError) {
        butler(c.toast.joinUnknown)
      } else {
        butler(c.toast.joined)
        onClose()
      }
    }
  }, [pendingJoin, lastError, butler, onClose, c])

  useEffect(() => {
    if (open) setCode('')
  }, [open])

  const submit = () => {
    const trimmed = code.trim()
    if (!trimmed) return
    const res = joinCrew(trimmed)
    if (!res.ok) {
      butler(res.reason)
      return
    }
    submitted.current = true
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h2 className="card-title">{c.joinTitle}</h2>
      <p className="mt-3 text-sm text-ink-dim">{c.joinBlurb}</p>
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        placeholder={c.codePlaceholder}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="mt-4 w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-center font-display text-[20px] font-semibold uppercase tracking-[0.2em] outline-none placeholder:text-ink-faint focus:border-accent"
      />
      <button
        type="button"
        disabled={!code.trim() || pendingJoin !== null}
        onClick={submit}
        className="btn-cta mt-4 w-full py-3 text-sm disabled:opacity-50"
      >
        {pendingJoin !== null && submitted.current ? c.joining : c.joinCta}
      </button>
    </Sheet>
  )
}

/** whether the crew doors should exist at all on this device */
export function crewsAvailable(): boolean {
  return offReason() === null
}
