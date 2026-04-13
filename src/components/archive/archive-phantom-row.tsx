import Link from 'next/link'
import { Camera, Film, AlertTriangle, ExternalLink } from 'lucide-react'
import type { PhantomEntry } from '@/lib/services/archive-service'

type Props = {
  item: PhantomEntry
}

export function ArchivePhantomRow({ item }: Props) {
  const dateStr = item.releaseDate
    ? new Date(item.releaseDate).toISOString().split('T')[0]
    : null

  const checkedStr = item.archiveLastChecked
    ? new Date(item.archiveLastChecked).toISOString().split('T')[0]
    : null

  const href = item.type === 'set' ? `/sets/${item.id}` : `/staging-sets?selected=${item.id}`

  return (
    <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-card/70 px-4 py-3 shadow-sm backdrop-blur-sm">
      {/* Warning icon */}
      <AlertTriangle size={14} className="shrink-0 text-red-500" />

      {/* Type icon */}
      <span className="shrink-0 text-muted-foreground/60">
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
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>

      {/* Archive path */}
      <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground/60 xl:block max-w-64" title={item.archivePath}>
        {item.archivePath}
      </span>

      {/* Last checked */}
      {checkedStr && (
        <span className="shrink-0 text-[11px] text-red-500/70">last seen {checkedStr}</span>
      )}

      {/* Record type badge */}
      <span className={
        item.type === 'set'
          ? 'shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'
          : 'shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400'
      }>
        {item.type}
      </span>

      {/* Navigate */}
      <Link
        href={href}
        target={item.type === 'set' ? '_blank' : undefined}
        className="shrink-0 text-muted-foreground/50 hover:text-foreground"
        title="Open record"
      >
        <ExternalLink size={14} />
      </Link>
    </div>
  )
}
