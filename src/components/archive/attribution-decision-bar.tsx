'use client'

import { cn } from '@/lib/utils'
import { PersonIdentity } from '@/components/shared/person-identity'
import type { FolderCandidate } from '@/lib/attribution-candidates'

export type PersonReference = {
  icgId: string
  avatarUrl: string | null
  kind: 'person' | 'catalogue' | 'archive' | 'none'
  sampleCovers: string[]
  personId: string | null
}

export type FolderFilter = 'open' | 'all' | 'decided'

type DecisionBarProps = {
  filter: FolderFilter
  onFilter: (f: FolderFilter) => void
  counts: { open: number; decided: number; total: number }
  candidates: FolderCandidate[]
  references: Map<string, PersonReference>
  /** Cover of the folder currently under the cursor — the right half of the comparison. */
  focusedCoverUrl: string | null
  focusedName: string | null
  busy: boolean
  onPick: (c: FolderCandidate) => void
  onOpenPicker: () => void
}

/**
 * Everything the keyboard depends on, pinned to the top of the scroll container.
 *
 * The digit keys map to the candidate strip, so letting it scroll away makes
 * `1…9` unreadable exactly when the operator is deep in a long group. `sticky
 * top-0` works because `<main id="app-scroll">` is the app's single scroll
 * container — do not introduce a second one.
 *
 * The comparison strip is the other half: every comparable system (Lightroom,
 * digiKam, Immich, Google Photos) puts a reference face beside the candidate
 * image. Deciding "is this her" from a name alone is guesswork.
 */
export function AttributionDecisionBar({
  filter,
  onFilter,
  counts,
  candidates,
  references,
  focusedCoverUrl,
  focusedName,
  busy,
  onPick,
  onOpenPicker,
}: DecisionBarProps) {
  const pct = counts.total === 0 ? 0 : Math.round((counts.decided / counts.total) * 100)
  const top = candidates[0]
  const topRef = top ? references.get(top.icgId) : undefined

  return (
    <div className="sticky top-0 z-30 -mx-3 mb-3 space-y-2 border-b border-border/60 bg-card/95 px-3 py-2 backdrop-blur">
      {/* Progress — the one number that says whether a long group is worth starting now. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-medium tabular-nums">
          {counts.decided} / {counts.total} decided
        </span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Which folders to show">
          {([
            ['open', `Open ${counts.open}`],
            ['all', `All ${counts.total}`],
            ['decided', `Decided ${counts.decided}`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={filter === id}
              onClick={() => onFilter(id)}
              className={cn(
                'rounded px-2 py-0.5 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                filter === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 text-muted-foreground">
          <span><Key>←→↑↓</Key> move</span>
          <span><Key>A</Key> confirm</span>
          <span><Key>X</Key> not this one</span>
          <span><Key>Space</Key> skip</span>
          <span><Key>U</Key> undo</span>
          <span><Key>1</Key>…<Key>9</Key> pick · <Key>⇧</Key> adds</span>
          <span><Key>/</Key> search</span>
        </span>
      </div>

      {/* Reference ⟷ focused cover, side by side so the eye never has to travel. */}
      {(topRef?.avatarUrl || focusedCoverUrl) && (
        <div className="flex items-stretch gap-2">
          <Frame
            url={topRef?.avatarUrl ?? null}
            label={top ? `${top.name} (${top.icgId})` : 'no candidate'}
            badge={topRef ? REFERENCE_LABEL[topRef.kind] : undefined}
          />
          {topRef?.sampleCovers.slice(0, 2).map((c) => (
            <Frame key={c} url={c} label="already confirmed as them" muted />
          ))}
          <span className="self-center text-xs text-muted-foreground">vs</span>
          <Frame url={focusedCoverUrl} label={focusedName ?? 'this folder'} />
        </div>
      )}

      {/* Digits map to this list, in this order. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {candidates.length === 0 ? (
          <span className="text-xs text-muted-foreground">No candidate left for this folder.</span>
        ) : (
          candidates.slice(0, 9).map((c, i) => {
            const ref = references.get(c.icgId)
            return (
              <button
                key={c.icgId}
                onClick={() => onPick(c)}
                disabled={busy}
                title={c.fromFolder ? 'Suggested for this folder' : 'Suggested elsewhere in this group'}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs ring-1 transition-colors duration-150',
                  'hover:bg-primary hover:text-primary-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  c.fromFolder ? 'bg-background ring-border' : 'bg-transparent ring-border/50',
                )}
              >
                {ref?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- MinIO-signed URL
                  <img src={ref.avatarUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="h-6 w-6 rounded-full bg-muted" />
                )}
                <Key>{String(i + 1)}</Key>
                <PersonIdentity name={c.name} icgId={c.icgId} />
              </button>
            )
          })
        )}
        <button
          onClick={onOpenPicker}
          disabled={busy}
          className="ml-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          someone else…
        </button>
      </div>
    </div>
  )
}

const REFERENCE_LABEL: Record<PersonReference['kind'], string | undefined> = {
  person: 'curated',
  catalogue: 'catalogue',
  archive: 'from archive',
  none: undefined,
}

function Frame({
  url,
  label,
  badge,
  muted,
}: {
  url: string | null
  label: string
  badge?: string
  muted?: boolean
}) {
  return (
    <figure className={cn('w-24 shrink-0', muted && 'opacity-70')}>
      <div className="relative aspect-[3/4] overflow-hidden rounded border border-border/60 bg-muted/60">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-signed URL
          <img src={url} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
            no image
          </span>
        )}
        {badge && (
          <span className="absolute bottom-0 left-0 right-0 bg-background/80 px-1 text-center text-[9px] text-muted-foreground">
            {badge}
          </span>
        )}
      </div>
      <figcaption className="mt-0.5 truncate text-[10px] text-muted-foreground" title={label}>
        {label}
      </figcaption>
    </figure>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px] leading-4">{children}</kbd>
  )
}
