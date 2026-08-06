'use client'

import { Check, Search, SkipForward, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonIdentity } from '@/components/shared/person-identity'
import type { FolderCandidate } from '@/lib/attribution-candidates'
import type { WorkbenchMode } from '@/lib/workbench-session'

export type PersonReference = {
  icgId: string
  avatarUrl: string | null
  kind: 'person' | 'catalogue' | 'archive' | 'none'
  sampleCovers: string[]
  personId: string | null
}

const PROVENANCE: Record<PersonReference['kind'], string> = {
  person: 'curated headshot',
  catalogue: 'catalogue portrait',
  archive: 'from a folder you confirmed',
  none: 'no image',
}

type InspectorProps = {
  mode: WorkbenchMode
  /** In person-led mode the pinned person; in folder-led the likeliest candidate. */
  subject: FolderCandidate | null
  reference: PersonReference | undefined
  candidates: FolderCandidate[]
  references: Map<string, PersonReference>
  decided: boolean
  busy: boolean
  onYes: () => void
  onNo: () => void
  onPick: (c: FolderCandidate) => void
  onAddPick: (c: FolderCandidate) => void
  onSkip: () => void
  onUndo: () => void
  onSearch: () => void
}

/**
 * The right rail: who, then the choices, then the verbs.
 *
 * The reference face is rendered at its **native size** and never stretched. The
 * catalogue's own portraits are 130 × 195 px — the source files are themselves
 * thumbnails, so there is nothing larger to fetch — and a face blown up to fill a
 * panel is mush, which is worse than a small sharp one for the only thing this
 * panel exists to support: recognising someone.
 *
 * Provenance is spelled out because the rungs are not equal evidence. A curated
 * headshot is the user's own choice; a cover from a folder they confirmed is a
 * useful hint that could still be circular. Saying which is which costs a line.
 */
export function WorkbenchInspector({
  mode,
  subject,
  reference,
  candidates,
  references,
  decided,
  busy,
  onYes,
  onNo,
  onPick,
  onAddPick,
  onSkip,
  onUndo,
  onSearch,
}: InspectorProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 border-l border-border/60 bg-card/40 p-3">
      {/* Who */}
      {subject ? (
        <div className="flex gap-3">
          <div className="shrink-0 overflow-hidden rounded border border-border/60 bg-muted">
            {reference?.avatarUrl ? (
              // Native size: 130 × 195 is what exists; scaling it up only blurs it.
              // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
              <img
                src={reference.avatarUrl}
                alt=""
                className="block max-h-[195px] w-[130px] object-contain"
              />
            ) : (
              <span className="flex h-[195px] w-[130px] items-center justify-center text-[10px] text-muted-foreground">
                no image
              </span>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <PersonIdentity name={subject.name} icgId={subject.icgId} className="text-sm font-medium" />
            <p className="text-[10px] text-muted-foreground">{PROVENANCE[reference?.kind ?? 'none']}</p>
            {mode === 'person' && (
              <p className="text-[11px] text-muted-foreground">
                Pinned — every folder answers yes or no about this person.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded bg-muted/50 px-2 py-3 text-xs text-muted-foreground">
          No candidate for this folder. Press <Kbd>/</Kbd> to find someone.
        </p>
      )}

      {/* The verbs, worded for the question actually on screen. */}
      <div className="space-y-1.5">
        {decided ? (
          <Action onClick={onUndo} busy={busy} icon={Undo2} label="Undo this folder" hint="U" />
        ) : mode === 'person' ? (
          <>
            <Action onClick={onYes} busy={busy} icon={Check} label="Yes, this is them" hint="J" tone="primary" disabled={!subject} />
            <Action onClick={onNo} busy={busy} icon={X} label="No, someone else" hint="N" disabled={!subject} />
          </>
        ) : (
          <>
            <Action
              onClick={() => subject && onPick(subject)}
              busy={busy}
              icon={Check}
              label="Confirm the top candidate"
              hint="A"
              tone="primary"
              disabled={!subject}
            />
            <Action onClick={onNo} busy={busy} icon={X} label="Not this one" hint="X" disabled={!subject} />
          </>
        )}
        <Action onClick={onSkip} busy={busy} icon={SkipForward} label="Skip for now" hint="Space" />
        <Action onClick={onSearch} busy={busy} icon={Search} label="Someone else…" hint="/" />
      </div>

      {/* Choices — digits map to this list, in this order. */}
      {candidates.length > 0 && (
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Candidates</p>
          {candidates.slice(0, 9).map((c, i) => {
            const ref = references.get(c.icgId)
            return (
              <button
                key={c.icgId}
                onClick={() => onPick(c)}
                onContextMenu={(e) => {
                  // Right-click adds without replacing — the mouse counterpart of
                  // Shift+digit, for a set with several participants.
                  e.preventDefault()
                  onAddPick(c)
                }}
                disabled={busy}
                title={c.fromFolder ? 'Suggested for this folder' : 'Suggested elsewhere in this group'}
                className={cn(
                  'flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs transition-colors duration-150',
                  'hover:bg-primary hover:text-primary-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  !c.fromFolder && 'opacity-80',
                )}
              >
                <Kbd>{String(i + 1)}</Kbd>
                {ref?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- MinIO URL
                  <img src={ref.avatarUrl} alt="" className="h-8 w-6 shrink-0 rounded object-cover" />
                ) : (
                  <span className="h-8 w-6 shrink-0 rounded bg-muted" />
                )}
                <PersonIdentity name={c.name} icgId={c.icgId} className="min-w-0" />
              </button>
            )
          })}
          <p className="pt-1 text-[10px] text-muted-foreground">
            <Kbd>⇧</Kbd>+digit adds a second person · right-click does the same
          </p>
        </div>
      )}
    </aside>
  )
}

function Action({
  onClick,
  busy,
  icon: Icon,
  label,
  hint,
  tone = 'default',
  disabled,
}: {
  onClick: () => void
  busy: boolean
  icon: typeof Check
  label: string
  hint: string
  tone?: 'primary' | 'default'
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'primary'
          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <Kbd>{hint}</Kbd>
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="shrink-0 rounded border border-border bg-background px-1 font-mono text-[10px] leading-4 text-foreground">
      {children}
    </kbd>
  )
}
