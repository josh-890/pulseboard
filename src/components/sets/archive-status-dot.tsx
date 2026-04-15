import { cn } from '@/lib/utils'

type SuggestedFolder = {
  folderName: string
  fileCount: number | null
  confidence: 'HIGH' | 'MEDIUM'
}

type Props = {
  status: string | null | undefined
  path?: string | null
  fileCount?: number | null
  /** When set and status has no confirmed link, show amber suggestion dot */
  suggestedFolder?: SuggestedFolder | null
}

const STATUS_STYLES: Record<string, string> = {
  OK:         'bg-green-500',
  LINKED:     'bg-amber-400',
  CHANGED:    'bg-amber-500',
  MISSING:    'bg-red-500',
  INCOMPLETE: 'bg-orange-500',
}

const CONFIRMED_STATUSES = new Set(['OK', 'LINKED', 'CHANGED', 'MISSING', 'INCOMPLETE'])

export function ArchiveStatusDot({ status, path, fileCount, suggestedFolder }: Props) {
  const hasConfirmedLink = status && CONFIRMED_STATUSES.has(status)

  // No confirmed link but a suggestion exists — show amber suggestion dot
  if (!hasConfirmedLink && suggestedFolder) {
    const tooltip = [
      `Archive suggestion (${suggestedFolder.confidence === 'HIGH' ? 'date+code match' : 'title match'})`,
      suggestedFolder.folderName,
      suggestedFolder.fileCount != null ? `${suggestedFolder.fileCount} files` : null,
    ].filter(Boolean).join('\n')

    return (
      <span
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          suggestedFolder.confidence === 'HIGH' ? 'bg-amber-500' : 'bg-amber-400/50',
        )}
        title={tooltip}
      />
    )
  }

  if (!hasConfirmedLink) {
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full border border-border/60"
        title="No archive folder linked"
      />
    )
  }

  const dotClass = STATUS_STYLES[status!] ?? 'bg-muted-foreground/40'

  const label = status === 'OK' ? 'Verified'
    : status === 'LINKED'     ? 'Linked'
    : status === 'CHANGED'    ? 'Changed'
    : status === 'MISSING'    ? 'Missing'
    : status === 'INCOMPLETE' ? 'Incomplete'
    : status

  const tooltip = [
    `Archive: ${label}`,
    path ? path : null,
    fileCount != null ? `${fileCount} files` : null,
  ].filter(Boolean).join('\n')

  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', dotClass)}
      title={tooltip}
    />
  )
}
