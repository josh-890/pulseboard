'use client'

import { cn } from '@/lib/utils'
import type { FolderPerson } from '@/lib/services/archive-service'

type Props = {
  claims: FolderPerson[]
  cast: FolderPerson[]
  className?: string
}

/** Beyond this the line stops being scannable and starts being a paragraph. */
const SHOWN = 4

/**
 * Who a folder is said to hold, in one line of the archive list.
 *
 * Two sources, never merged (ADR-0028): a **claim** is your own statement about
 * the folder, a **cast** is the credit list of the set behind a confirmed link.
 * A folder settled by an import usually has only the second — showing claims
 * alone would leave exactly the finished folders looking empty, which is the
 * reading that has already cost a debugging round.
 *
 * Chips only. The way into the editor sits in the row's action cluster instead,
 * because this line is rendered only where somebody is recorded — and the folder
 * you most need to open is the one where nobody is.
 */
export function ArchiveRowPeople({ claims, cast, className }: Props) {
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

      {hidden > 0 && <span className="shrink-0 text-muted-foreground">+{hidden}</span>}

    </div>
  )
}
