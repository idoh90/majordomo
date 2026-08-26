import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthStore } from '../../core/auth/store'
import { useShellStore } from '../../core/store/shell'
import { useShareStore } from '../../core/sync/shareStore'
import type { CrewRole } from '../../core/sync/shareTransport'
import { ConfirmDialog } from '../../core/ui/ConfirmDialog'
import { SegmentedControl } from '../../core/ui/SegmentedControl'
import { useNow } from '../../core/useNow'
import { voice } from '../../core/voice'
import { StatusPill } from './bits'
import { editCode, formatCode, CODE_LEN } from './joinCode'
import { memberContribution } from './lib'
import {
  admitApplicant,
  announceName,
  crewRole,
  disbandCrew,
  joinCrew,
  leaveCrew,
  removeMember,
  rotateCrewCode,
  setCrewPrivacy,
  setCrewRole,
  shareVenture,
} from './share'
import { useWorkshopStore } from './store'
import type { Venture } from './types'

/**
 * THE CREW ROOM — one screen for the whole of sharing.
 *
 * It replaced a sheet, and the reason is what a sheet could not hold: a crew
 * now has a door policy, a waiting list and three ranks, and all three are the
 * keeper's to work while looking at the roster they apply to. A bottom sheet
 * that has to scroll past a contribution table to reach an ADMIT button is a
 * worse answer than a room.
 *
 * Every act here commits immediately and reports through the butler line, so
 * the room never holds a draft and never needs a dirty guard. The ranks it
 * draws are the registry's (migration 0006) — this screen is the place they
 * are SAID, never the place they are decided.
 */

const ROLES: CrewRole[] = ['keeper', 'hand', 'guest']

export function CrewScreen({
  ventures,
  focus,
  onBack,
  butler,
}: {
  /** the live shelf, in shelf order — crewed ones are floated to the top here */
  ventures: Venture[]
  /** the venture the reader arrived asking about, if they arrived from a board */
  focus: string | null
  onBack: () => void
  butler: (msg: string) => void
}) {
  const c = voice.workshop.crew
  const crewed = ventures.filter((v) => v.shareId)
  const solo = ventures.filter((v) => !v.shareId)

  // the venture they came in asking about leads, whatever the shelf thinks
  const ordered = useMemo(() => {
    const list = [...crewed, ...solo]
    if (!focus) return list
    const i = list.findIndex((v) => v.id === focus)
    return i <= 0 ? list : [list[i], ...list.filter((v) => v.id !== focus)]
  }, [crewed, solo, focus])

  return (
    <div className="flex flex-col gap-3.5">
      <section className="panel px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="btn-soft px-3.5 py-2 font-display text-[10.5px] font-bold tracking-[0.14em]"
          >
            ‹ {c.back}
          </button>
          <h2 className="card-title">{c.screenTitle}</h2>
        </div>
        <p className="mt-3 max-w-[62ch] text-sm text-ink-dim">{c.screenBlurb}</p>
        {crewed.length === 0 && (
          <p className="mt-2.5 text-[12.5px] italic text-ink-faint">{c.screenEmpty}</p>
        )}
      </section>

      <NamePanel butler={butler} />
      <JoinPanel butler={butler} />

      {ordered.map((v) => (
        <VenturePanel key={v.id} venture={v} butler={butler} onLeft={onBack} />
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- the name */

/**
 * What the crews call you.
 *
 * It used to be the front half of your email address, taken without asking and
 * shown to everyone on every crew you touched. Now it is a question, and it
 * sits at the top of this room because it governs everything under it: the two
 * acts below both refuse until it has an answer.
 *
 * Changing it re-announces to every crew whose code this device holds, so the
 * old name does not linger on a roster somebody is still reading.
 */
function NamePanel({ butler }: { butler: (msg: string) => void }) {
  const c = voice.workshop.crew
  const crewName = useShellStore((s) => s.crewName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(crewName)

  const open = editing || crewName === ''

  const save = () => {
    const chosen = draft.trim()
    if (!chosen) return
    useShellStore.getState().setCrewName(chosen)
    setEditing(false)
    butler(c.toast.renamed)
    void announceName()
  }

  return (
    <section
      className="panel px-5 py-5 sm:px-6"
      style={
        crewName === ''
          ? { borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)' }
          : undefined
      }
    >
      <SectionLabel>{c.nameTitle}</SectionLabel>
      {open ? (
        <>
          <p className="mt-2 max-w-[62ch] text-sm text-ink-dim">{c.nameBlurb}</p>
          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              placeholder={c.namePlaceholder}
              maxLength={40}
              autoCorrect="off"
              spellCheck={false}
              aria-label={c.nameTitle}
              className="w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-[15px] outline-none placeholder:text-ink-faint focus:border-accent sm:flex-1"
            />
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={save}
              className="btn-cta px-8 py-3 text-sm disabled:opacity-40 sm:w-auto"
            >
              {c.nameSave}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-sm text-ink-dim">{c.nameIs(crewName)}</span>
          <button
            type="button"
            onClick={() => {
              setDraft(crewName)
              setEditing(true)
            }}
            className="ml-auto font-display text-[9.5px] font-semibold tracking-[0.14em] text-ink-faint transition-colors hover:text-ink"
          >
            {c.nameChange}
          </button>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------- the join door */

/**
 * Typing a code in, and whatever became of the last one. Both halves live
 * together because they are one thought: a vetted crew answers an application
 * minutes or days later, and the place that says "with the keeper" has to be
 * the place the code was typed.
 */
function JoinPanel({ butler }: { butler: (msg: string) => void }) {
  const c = voice.workshop.crew
  const [code, setCode] = useState('')
  const pendingJoin = useShareStore((s) => s.pendingJoin)
  const applications = useShareStore((s) => s.applications)
  const lastError = useShareStore((s) => s.lastError)
  const [sent, setSent] = useState(false)
  /**
   * How many applications were already lodged when this code went in. The
   * answer to "did the crew let me in or only take my name" is whether the
   * list GREW — counting it non-empty would call every join an application
   * for anyone with an older one still outstanding.
   */
  const lodgedBefore = useRef(0)

  // the mailbox clearing is the service's answer: an error means the code was
  // refused, silence means it was taken — as an entry or as an application
  useEffect(() => {
    if (!sent || pendingJoin !== null) return
    setSent(false)
    if (lastError) {
      butler(c.toast.joinUnknown)
      return
    }
    setCode('')
    const now = Object.keys(useShareStore.getState().applications).length
    butler(now > lodgedBefore.current ? c.toast.applied : c.toast.joined)
  }, [sent, pendingJoin, lastError, butler, c])

  const submit = () => {
    if (code.length < CODE_LEN) return
    const res = joinCrew(code)
    if (!res.ok) {
      butler(res.reason)
      return
    }
    lodgedBefore.current = Object.keys(useShareStore.getState().applications).length
    setSent(true)
  }

  const lodged = Object.entries(applications)

  return (
    <section className="panel px-5 py-5 sm:px-6">
      <h2 className="card-title">{c.joinTitle}</h2>
      <p className="mt-2.5 text-sm text-ink-dim">{c.joinBlurb}</p>
      <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
        <input
          type="text"
          value={formatCode(code)}
          onChange={(e) => setCode(editCode(e.target.value, code))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder={c.codePlaceholder}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label={c.joinTitle}
          className="w-full rounded-xl border border-line bg-panel-2 px-4 py-3 text-center font-display text-[20px] font-semibold uppercase tracking-[0.2em] outline-none placeholder:text-ink-faint focus:border-accent sm:flex-1"
        />
        <button
          type="button"
          disabled={code.length < CODE_LEN || sent}
          onClick={submit}
          className="btn-cta px-8 py-3 text-sm disabled:opacity-40 sm:w-auto"
        >
          {sent ? c.joining : c.joinCta}
        </button>
      </div>

      {lodged.length > 0 && (
        <div className="mt-5">
          <SectionLabel>{c.appliedTitle}</SectionLabel>
          <div className="mt-2 flex flex-col gap-1.5">
            {lodged.map(([shareId, app]) => (
              <div key={shareId} className="flex items-center gap-2 text-[13px]">
                <span
                  className="h-1.5 w-1.5 rotate-45"
                  style={{
                    background: app.declined ? 'var(--color-ink-faint)' : 'var(--color-accent)',
                  }}
                  aria-hidden
                />
                <span className={app.declined ? 'flex-1 text-ink-faint' : 'flex-1 text-ink-dim'}>
                  {app.declined
                    ? c.appliedDeclined(formatCode(app.code))
                    : c.appliedWaiting(formatCode(app.code))}
                </span>
                {app.declined && (
                  <button
                    type="button"
                    onClick={() => useShareStore.getState().setApplication(shareId, null)}
                    className="font-display text-[9px] font-semibold tracking-[0.14em] text-ink-faint transition-colors hover:text-ink-dim"
                  >
                    {c.dismiss}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------- one venture */

type Confirming =
  | { kind: 'kick'; userId: string; label: string }
  | { kind: 'decline'; userId: string; label: string }
  | { kind: 'leave' }
  | { kind: 'rotate' }
  | { kind: 'disband' }
  | { kind: 'delete' }
  | null

function VenturePanel({
  venture,
  butler,
  onLeft,
}: {
  venture: Venture
  butler: (msg: string) => void
  /** leaving or disbanding takes the panel's subject away — go back */
  onLeft: () => void
}) {
  const c = voice.workshop.crew
  const me = useAuthStore((s) => s.userId)
  const authStatus = useAuthStore((s) => s.status)
  const members = useWorkshopStore((s) => s.members)
  const workEntries = useWorkshopStore((s) => s.workEntries)
  const cards = useWorkshopStore((s) => s.cards)
  const deleteVenture = useWorkshopStore((s) => s.deleteVenture)
  const codes = useShareStore((s) => s.codes)
  const owners = useShareStore((s) => s.owners)
  const visibilities = useShareStore((s) => s.visibilities)
  const weekStart = useShellStore((s) => s.weekStart)
  const now = useNow()

  const [working, setWorking] = useState(false)
  const [confirming, setConfirming] = useState<Confirming>(null)

  const shareId = venture.shareId ?? null
  const roster = shareId ? (members[shareId] ?? []) : []
  const crew = roster.filter((m) => m.status === 'active')
  const waiting = roster.filter((m) => m.status === 'pending')
  const code = shareId ? codes[shareId] : undefined
  const role = crewRole(shareId ?? undefined, members, owners, me)
  const isKeeper = role === 'keeper'
  const vetted = shareId ? visibilities[shareId] === 'vetted' : false
  const contribution = shareId
    ? memberContribution(venture.id, crew, workEntries, cards, now, weekStart)
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
    <section className="panel px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="font-display text-[15px] font-bold uppercase tracking-[0.08em]">
          {venture.name}
        </h2>
        <StatusPill status={venture.status} />
        {shareId && role && (
          <span
            className="rounded-pill border px-2 py-0.5 font-display text-[8.5px] font-semibold tracking-[0.14em]"
            style={{
              borderColor: 'color-mix(in srgb, var(--color-accent) 45%, transparent)',
              color: 'var(--color-accent)',
            }}
          >
            {c.rank[role]}
          </span>
        )}
      </div>

      {!shareId ? (
        <>
          <p className="mt-3 max-w-[62ch] text-sm text-ink-dim">{c.blurb}</p>
          <button
            type="button"
            disabled={working || authStatus !== 'signedIn'}
            onClick={() => {
              void run(() => shareVenture(venture.id), c.toast.shared)
            }}
            className="btn-cta mt-4 w-full py-3 text-sm disabled:opacity-40 sm:w-auto sm:px-10"
          >
            {working ? c.creating : c.cta}
          </button>
          {authStatus !== 'signedIn' && (
            <p className="mt-2.5 text-[12px] text-ink-faint">{c.toast.needsSignIn}</p>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 text-[13px] text-ink-dim">{c.myRank({ rank: c.rank[role ?? 'hand'] })}</p>

          {/* ---------------------------------------------- code + the door */}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {/* THE CODE IS THE KEEPER'S. Every rank used to see it, which made a
                guest — the rank that exists to change nothing — able to hand out
                an invitation, and `join_share` seats whoever uses one as a HAND.
                The registry is where that is actually enforced (0008 takes the
                column out of the read grant); this is only where it is SAID. */}
            <div className="rounded-xl border border-line bg-panel-2 px-4 py-3.5">
              <SectionLabel>{c.codeLabel}</SectionLabel>
              {isKeeper ? (
                <>
                  <div className="stat-num mt-1 font-display text-[26px] font-semibold tracking-[0.14em]">
                    {code ? formatCode(code) : '····-····'}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <CopyButton
                      label={c.copyCode}
                      text={code ? formatCode(code) : null}
                      onDone={() => butler(c.copied)}
                    />
                    <CopyButton
                      label={c.copyLink}
                      text={code ? `${window.location.origin}/?join=${code}` : null}
                      onDone={() => butler(c.copied)}
                    />
                    <button
                      type="button"
                      disabled={working || !code}
                      onClick={() => setConfirming({ kind: 'rotate' })}
                      className="btn-soft rounded-pill px-3 py-1.5 font-display text-[10px] font-semibold tracking-[0.12em] disabled:opacity-40"
                    >
                      {c.rotate}
                    </button>
                  </div>
                  <p className="mt-2.5 text-[12px] leading-snug text-ink-dim">{c.rotateNote}</p>
                </>
              ) : (
                <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">{c.codeKeepers}</p>
              )}
            </div>

            <div className="rounded-xl border border-line bg-panel-2 px-4 py-3.5">
              <SectionLabel>{c.privacyTitle}</SectionLabel>
              {isKeeper ? (
                <>
                  <SegmentedControl
                    className="mt-2"
                    options={[
                      { value: 'open', label: c.privacyOpen },
                      { value: 'vetted', label: c.privacyVetted },
                    ]}
                    value={vetted ? 'vetted' : 'open'}
                    onChange={(v) => {
                      if ((v === 'vetted') === vetted) return
                      void run(
                        () => setCrewPrivacy(shareId, v),
                        v === 'vetted' ? c.toast.doorVetted : c.toast.doorOpen,
                      )
                    }}
                  />
                  <p className="mt-2.5 text-[12px] leading-snug text-ink-dim">
                    {vetted ? c.privacyVettedNote : c.privacyOpenNote}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-[13px] text-ink-dim">{c.privacyStanding({ vetted })}</p>
              )}
            </div>
          </div>

          {/* -------------------------------------------- the waiting list */}
          {isKeeper && waiting.length > 0 && (
            <div className="mt-5">
              <SectionLabel>{c.waitingTitle}</SectionLabel>
              <div className="mt-2 flex flex-col gap-2">
                {waiting.map((m) => (
                  <div
                    key={m.userId}
                    className="flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
                      background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                    }}
                  >
                    <span className="flex-1 text-[13px]">{c.applicantLine(m.label)}</span>
                    <button
                      type="button"
                      disabled={working}
                      onClick={() => {
                        void run(() => admitApplicant(shareId, m.userId), c.toast.admitted)
                      }}
                      className="btn-cta px-4 py-1.5 text-[10.5px] tracking-[0.12em] disabled:opacity-40"
                    >
                      {c.admit}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirming({ kind: 'decline', userId: m.userId, label: m.label })
                      }
                      className="px-2 py-1.5 font-display text-[10px] font-semibold tracking-[0.12em] text-ink-faint transition-colors hover:text-danger"
                    >
                      {c.turnAway}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* -------------------------------------------------- the roster */}
          <div className="mt-5">
            <SectionLabel>{c.rosterTitle}</SectionLabel>
            <div className="mt-2 flex flex-col gap-2">
              {crew.map((m) => {
                const theirRole: CrewRole = owners[shareId] === m.userId ? 'keeper' : m.role
                const rankable = isKeeper && theirRole !== 'keeper'
                return (
                  <div
                    key={m.userId}
                    className="rounded-xl border border-line bg-panel-2 px-3.5 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{m.label}</span>
                      {m.userId === me && (
                        <span className="text-[11px] text-ink-faint">· {c.you}</span>
                      )}
                      <span className="text-[11px] tracking-[0.1em] text-ink-faint">
                        · {c.rank[theirRole]}
                      </span>
                      {isKeeper && m.userId !== me && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirming({ kind: 'kick', userId: m.userId, label: m.label })
                          }
                          className="ml-auto font-display text-[9.5px] font-semibold tracking-[0.12em] text-ink-faint transition-colors hover:text-danger"
                        >
                          {c.kick}
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-snug text-ink-dim">
                      {c.rankNote[theirRole]}
                    </p>
                    {rankable && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ROLES.filter((r) => r !== 'keeper').map((r) => (
                          <button
                            key={r}
                            type="button"
                            disabled={working || r === theirRole}
                            aria-pressed={r === theirRole}
                            onClick={() => {
                              void run(
                                () => setCrewRole(shareId, m.userId, r),
                                c.toast.ranked({ label: m.label, rank: c.rank[r] }),
                              )
                            }}
                            className={`rounded-pill border px-3 py-1 font-display text-[9.5px] font-semibold tracking-[0.14em] transition-colors ${
                              r === theirRole
                                ? 'border-accent bg-accent/10 text-accent'
                                : 'border-line text-ink-faint hover:border-accent/40 hover:text-ink'
                            }`}
                          >
                            {c.rank[r]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* -------------------------------------------- the contribution */}
          {contribution.length > 0 && (
            <div className="mt-5">
              <SectionLabel>{c.contributionTitle}</SectionLabel>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
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

          {/* ---------------------------------------------- the leaving doors */}
          <div className="mt-6 flex flex-wrap gap-2">
            {isKeeper ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: 'disband' })}
                  className="btn-soft flex-1 py-2.5 text-[11px] tracking-[0.1em] sm:flex-none sm:px-8"
                >
                  {c.unshare}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming({ kind: 'delete' })}
                  className="flex-1 py-2.5 font-display text-[10px] font-semibold tracking-[0.12em] text-ink-faint transition-colors hover:text-danger sm:flex-none sm:px-6"
                >
                  {c.deleteButton}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming({ kind: 'leave' })}
                className="btn-soft flex-1 py-2.5 text-[11px] tracking-[0.1em] sm:flex-none sm:px-8"
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
        open={confirming?.kind === 'decline'}
        title={c.turnAwayTitle}
        message={confirming?.kind === 'decline' ? c.turnAwayBody(confirming.label) : undefined}
        confirmLabel={c.turnAwayYes}
        onConfirm={() => {
          if (confirming?.kind !== 'decline' || !shareId) return
          void run(() => removeMember(shareId, confirming.userId), c.toast.turnedAway)
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'leave'}
        title={c.leaveTitle}
        message={c.leaveBody}
        confirmLabel={c.leaveYes}
        onConfirm={() => {
          void run(() => leaveCrew(venture.id), c.toast.left)
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'rotate'}
        title={c.rotateTitle}
        message={c.rotateBody}
        confirmLabel={c.rotateYes}
        onConfirm={() => {
          void run(() => rotateCrewCode(venture.id), c.toast.rotated)
        }}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'disband'}
        title={c.unshareTitle}
        message={c.unshareBody}
        confirmLabel={c.unshareYes}
        onConfirm={() => {
          void run(() => disbandCrew(venture.id), c.toast.unshared)
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
          onLeft()
        }}
        onCancel={() => setConfirming(null)}
      />
    </section>
  )
}

/* --------------------------------------------------------------- furniture */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] tracking-[0.18em] text-ink-faint">{children}</div>
}

function CopyButton({
  label,
  text,
  onDone,
}: {
  label: string
  text: string | null
  onDone: () => void
}) {
  return (
    <button
      type="button"
      disabled={!text}
      onClick={() => {
        if (!text) return
        void navigator.clipboard?.writeText(text).catch(() => {})
        onDone()
      }}
      className="btn-soft flex-1 py-2 text-[11px] tracking-[0.1em] disabled:opacity-40"
    >
      {label}
    </button>
  )
}
