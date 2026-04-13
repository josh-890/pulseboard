import Link from 'next/link'
import { Camera, Film, ExternalLink } from 'lucide-react'
import type { UntrackedEntry } from '@/lib/services/archive-service'

type Props = {
  item: UntrackedEntry
}

export function ArchiveUntrackedRow({ item }: Props) {
  const dateStr = item.releaseDate
    ? new Date(item.releaseDate).toISOString().split('T')[0]
    : null

  const href = item.type === 'set' ? `/sets/${item.id}` : `/staging-sets?selected=${item.id}`

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/70 px-4 py-3 shadow-sm backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity">
      {/* Type icon */}
      <span className="shrink-0 text-muted-foreground/50">
        {item.isVideo ? <Film size={14} /> : <Camera size={14} />}
      </span>

      {/* Date */}
      {dateStr && (
        <span className="w-28 shrink-0 text-xs text-muted-foreground">{dateStr}</span>
      )}

      {/* Channel */}
      {item.channelName && (
        <span className="w-36 shrink-0 truncate text-xs text-muted-foreground">{item.channelName}</span>
      )}

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{item.title}</span>

      {/* Record type badge */}
      <span className={
        item.type === 'set'
          ? 'shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'
          : 'shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400'
      }>
        {item.type}
      </span>

      {/* Navigate to set/staging to record path */}
      <Link
        href={href}
        target={item.type === 'set' ? '_blank' : undefined}
        className="shrink-0 text-muted-foreground/40 hover:text-foreground"
        title="Open to record archive path"
      >
        <ExternalLink size={14} />
      </Link>
    </div>
  )
}
