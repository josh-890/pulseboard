'use client'

import { cn } from '@/lib/utils'
import type { FolderPerson } from '@/lib/services/archive-service'

type Props = {
  claims: FolderPerson[]
  cast: FolderPerson[]
  /** Hand markers nobody has confirmed — the work waiting in "My markers". */
  markers?: FolderPerson[]
  className?: string
}

/** Beyond this the line stops being scannable and starts being a paragraph. */
const SHOWN = 4

/**
 * Who a folder is said to hold, in one line of the archive list.
 *
 * Three states, never merged (ADR-0028), each with its own colour because the
 * difference is the whole point:
 *
 *   **claim**  — solid green. Your statement, recorded.
 *   **cast**   — outlined grey. The linked set's credit list.
 *   **marker** — dashed violet. A file you dropped in `.pulseboard\` that nobody
 *                has confirmed: work waiting in *My markers*.
 *
 * A folder settled by an import usually has only the cast — showing claims alone
 * would leave exactly the finished folders looking empty, which is the reading
 * that has already cost a debugging round.
 *
 * Chips only. The way into the editor sits in the row's action cluster instead,
 * because this line is rendered only where somebody is recorded — and the folder
 * you most need to open is the one where nobody is.
 */
export function ArchiveRowPeople({ claims, cast, markers = [], className }: Props) {
  const shownClaims = claims.slice(0, SHOWN)
  const room = Math.max(0, SHOWN - shownClaims.length)
  const claimed = new Set(claims.map((c) => c.icgId))
  // A person the cast and a claim both name is one person, listed once — as a
  // claim, because that is the stronger statement.
  const castOnly = cast.filter((c) => !claimed.has(c.icgId))
  const shownCast = castOnly.slice(0, room)
  const hidden = claims.length - shownClaims.length + (castOnly.length - shownCast.length)

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-[11px]', className)}>
      {shownClaims.map((p) => (
        <span
          key={`claim-${p.icgId}`}
          title={`${p.name} (${p.icgId}) — your attribution`}
          className="max-w-[12rem] truncate rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-700 dark:text-emerald-400"
        >
          {p.name}
        </span>
      ))}

      {shownCast.map((p) => (
        <span
          key={`cast-${p.icgId}`}
          title={`${p.name} (${p.icgId}) — credited by the linked set`}
          className="max-w-[12rem] truncate rounded border border-border/50 px-1.5 py-0.5 text-muted-foreground"
        >
          {p.name}
        </span>
      ))}

      {markers.map((p) => (
        <span
          key={`marker-${p.icgId}`}
          title={`${p.name} (${p.icgId}) — your marker, not confirmed yet. Waiting in Archive → Attribution queue → My markers.`}
          className="max-w-[12rem] truncate rounded border border-dashed border-violet-500 bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-700 dark:text-violet-400"
        >
          {p.name} ?
        </span>
      ))}

      {hidden > 0 && <span className="shrink-0 text-muted-foreground">+{hidden}</span>}

    </div>
  )
}
