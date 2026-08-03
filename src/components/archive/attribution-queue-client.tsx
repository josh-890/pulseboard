'use client'

import { useCallback, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Undo2, UserX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttributionQueue, AttributionQueueGroup } from '@/lib/services/attribution-confirm-service'
import {
  confirmAttributionGroupAction,
  getGroupFoldersAction,
  markGroupNotAPersonAction,
  skipGroupAction,
  undoAttributionGroupAction,
} from '@/lib/actions/attribution-actions'
import { AttributionGroupFolders, type GroupFolder } from './attribution-group-folders'

type AttributionQueueClientProps = {
  initialQueue: AttributionQueue
  view: 'open' | 'conflicted' | 'decided'
}

const VIEWS = [
  { id: 'open', label: 'Open' },
  { id: 'conflicted', label: 'Needs a decision' },
  { id: 'decided', label: 'Decided' },
] as const

/**
 * The confirmation queue for archive attribution (ADR-0027, plan slice 5).
 *
 * Groups are ordered by leverage — folder count — because that is what makes
 * ~8.9k groups finite: the top 1,000 cover 14,090 folders. A group whose folders
 * all agree is one decision; the rest are where the judgement lives.
 *
 * There is no "confirm all visible" button and that is deliberate. A single
 * confirmation can touch 204 folders, and until the real error rate is known the
 * rate limiter is the operator's hand.
 */
export function AttributionQueueClient({ initialQueue, view }: AttributionQueueClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The list is DERIVED from props, never seeded into state. Switching views is a
  // client-side navigation: the component instance survives, so a `useState`
  // seeded from props would keep showing the previous view's groups while the
  // counters — read straight from props — updated. `dismissed` only hides what
  // this session just decided, so the row disappears immediately instead of
  // waiting for router.refresh() to land.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const groups = initialQueue.groups.filter((g) => !dismissed.has(g.key))
  const [expanded, setExpanded] = useState<string | null>(null)
  const [folders, setFolders] = useState<Record<string, GroupFolder[]>>({})
  const [loadingFolders, setLoadingFolders] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ key: string; text: string; tone: 'ok' | 'err' } | null>(null)
  const [, startTransition] = useTransition()

  const counts = initialQueue.counts

  const setView = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'open') params.delete('view')
    else params.set('view', next)
    startTransition(() => router.push(`/archive/attribution?${params.toString()}`))
  }

  // Folders are loaded on expand, not with the list: a group can hold 204 rows
  // with covers, and shipping that for every visible group would be most of a
  // megabyte nobody looks at.
  const toggle = useCallback(
    async (key: string) => {
      if (expanded === key) {
        setExpanded(null)
        return
      }
      setExpanded(key)
      if (folders[key]) return
      setLoadingFolders(key)
      const res = await getGroupFoldersAction(key)
      setLoadingFolders(null)
      if (res.success) setFolders((f) => ({ ...f, [key]: res.data }))
    },
    [expanded, folders],
  )

  const afterDecision = (key: string, text: string) => {
    setFlash({ key, text, tone: 'ok' })
    setDismissed((d) => new Set(d).add(key))
    setExpanded(null)
    startTransition(() => router.refresh())
  }

  const confirm = async (g: AttributionQueueGroup, icgIds: string[]) => {
    setBusy(g.key)
    const res = await confirmAttributionGroupAction(g.key, icgIds)
    setBusy(null)
    if (!res.success) {
      setFlash({ key: g.key, text: res.error, tone: 'err' })
      return
    }
    const d = res.data
    afterDecision(
      g.key,
      `${d.attributedFolders} folder(s) attributed` +
        (d.contactsCreated ? `, ${d.contactsCreated} contact(s) created` : '') +
        (d.dissentingFolders ? `, ${d.dissentingFolders} left for review` : ''),
    )
  }

  const notAPerson = async (g: AttributionQueueGroup) => {
    setBusy(g.key)
    const res = await markGroupNotAPersonAction(g.key)
    setBusy(null)
    if (res.success) afterDecision(g.key, `Ruled out — ${res.data.folderCount} folder(s) stay unattributed`)
    else setFlash({ key: g.key, text: res.error, tone: 'err' })
  }

  const skip = async (g: AttributionQueueGroup) => {
    setBusy(g.key)
    const res = await skipGroupAction(g.key)
    setBusy(null)
    if (res.success) afterDecision(g.key, 'Skipped')
    else setFlash({ key: g.key, text: res.error, tone: 'err' })
  }

  const undo = async (g: AttributionQueueGroup) => {
    setBusy(g.key)
    const res = await undoAttributionGroupAction(g.key)
    setBusy(null)
    if (res.success) afterDecision(g.key, `Undone — ${res.data.removedAttributions} attribution(s) removed`)
    else setFlash({ key: g.key, text: res.error, tone: 'err' })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Archive attribution</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Who is in each archive folder, grouped by channel and the name the folder carries.
              Confirming writes the attribution and registers unknown people as contacts — it
              creates no sets.{' '}
              <Link href="/archive" className="underline underline-offset-2 hover:text-foreground">
                Back to the archive
              </Link>
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Open', value: counts.open },
            { label: 'Unanimous', value: counts.unanimous },
            { label: 'Needs a decision', value: counts.conflicted },
            { label: 'No suggestion', value: counts.silent },
            { label: 'Decided', value: counts.decided },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-border/60 bg-card/50 px-3 py-2 backdrop-blur">
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{s.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label="Attribution queue view">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              role="tab"
              aria-selected={view === v.id}
              onClick={() => setView(v.id)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
          {view === 'decided' ? 'Nothing decided yet.' : 'Nothing left in this view.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => {
            const isOpen = expanded === g.key
            const isBusy = busy === g.key
            const [short] = g.key.split('|')
            return (
              <li
                key={g.key}
                className="rounded-lg border border-border/60 bg-card/50 backdrop-blur transition-colors duration-150"
              >
                <div className="flex flex-wrap items-center gap-3 p-3">
                  <button
                    onClick={() => toggle(g.key)}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{short}</span>
                    <span className="truncate font-medium">{g.aliasToken || <em className="text-muted-foreground">no name in folder</em>}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {g.folders} folder{g.folders === 1 ? '' : 's'}
                    </span>
                    {g.demotedFolders > 0 && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400"
                        title={`${g.demotedFolders} folder(s) carry a suggestion that needs a look`}
                      >
                        <AlertTriangle className="h-3 w-3" />
                        {g.demotedFolders}
                      </span>
                    )}
                  </button>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {g.votes.length === 0 ? (
                      <span className="text-sm text-muted-foreground">no suggestion</span>
                    ) : (
                      g.votes.slice(0, 4).map((v) => (
                        <span
                          key={v.icgId}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs',
                            g.unanimous
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                              : 'bg-muted text-muted-foreground',
                          )}
                          title={v.icgId}
                        >
                          {v.name}
                          <span className="tabular-nums opacity-70">{v.folders}</span>
                        </span>
                      ))
                    )}
                    {g.votes.length > 4 && (
                      <span className="text-xs text-muted-foreground">+{g.votes.length - 4}</span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {g.decision ? (
                      <>
                        <span className="rounded px-2 py-1 text-xs text-muted-foreground">
                          {g.decision === 'CONFIRMED'
                            ? `confirmed · ${g.attributedFolders} attributed`
                            : g.decision === 'NOT_A_PERSON'
                              ? 'not a person'
                              : 'skipped'}
                        </span>
                        <ActionButton onClick={() => undo(g)} busy={isBusy} label="Undo" icon={Undo2} />
                      </>
                    ) : (
                      <>
                        <ActionButton
                          onClick={() => confirm(g, g.votes.map((v) => v.icgId))}
                          busy={isBusy}
                          disabled={g.votes.length === 0}
                          label={g.unanimous ? 'Confirm' : 'Confirm all'}
                          icon={Check}
                          tone="primary"
                        />
                        <ActionButton onClick={() => notAPerson(g)} busy={isBusy} label="Not a person" icon={UserX} />
                        <ActionButton onClick={() => skip(g)} busy={isBusy} label="Skip" icon={X} />
                      </>
                    )}
                  </div>
                </div>

                {flash?.key === g.key && (
                  <p
                    className={cn(
                      'border-t border-border/60 px-3 py-2 text-sm',
                      flash.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive',
                    )}
                    role="status"
                  >
                    {flash.text}
                  </p>
                )}

                {isOpen && (
                  <div className="border-t border-border/60 p-3">
                    {loadingFolders === g.key ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading folders…
                      </p>
                    ) : (
                      <AttributionGroupFolders
                        folders={folders[g.key] ?? []}
                        votes={g.votes}
                        onConfirmOne={(icgId) => confirm(g, [icgId])}
                        busy={isBusy}
                      />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

type ActionButtonProps = {
  onClick: () => void
  busy: boolean
  disabled?: boolean
  label: string
  icon: typeof Check
  tone?: 'primary' | 'default'
}

function ActionButton({ onClick, busy, disabled, label, icon: Icon, tone = 'default' }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
