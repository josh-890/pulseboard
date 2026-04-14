import { cn } from '@/lib/utils'

type Props = {
  status: string | null | undefined
  path?: string | null
  fileCount?: number | null
}

const STATUS_STYLES: Record<string, string> = {
  OK:         'bg-green-500',
  LINKED:     'bg-amber-400',
  CHANGED:    'bg-amber-500',
  MISSING:    'bg-red-500',
  INCOMPLETE: 'bg-orange-500',
}

export function ArchiveStatusDot({ status, path, fileCount }: Props) {
  if (!status || status === 'NONE') {
    return (
      <span
        className="inline-block h-2 w-2 shrink-0 rounded-full border border-border/60"
        title="No archive folder linked"
      />
    )
  }

  const dotClass = STATUS_STYLES[status] ?? 'bg-muted-foreground/40'

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
