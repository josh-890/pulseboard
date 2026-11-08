'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { EntityMark } from '@/components/shared/entity-mark'
import type { EntityBrand } from '@/lib/brand-mark'

type Props = {
  channel: string
  /** The channel whose archive folder this is, when one claims it */
  brand: (EntityBrand & { channelId: string }) | null
  count: number
  collapsed: boolean
  onToggle: () => void
}

export function ArchiveChannelHeader({ channel, brand, count, collapsed, onToggle }: Props) {
  return (
    <div className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/40">
      <button
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        {collapsed
          ? <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
          : <ChevronDown  size={14} className="shrink-0 text-muted-foreground" />
        }
        {brand && <EntityMark brand={brand} variant="tile" size="xs" />}
        <span className="truncate text-sm font-semibold">{channel}</span>
        <span className={cn(
          'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
          'bg-muted/60 text-muted-foreground',
        )}>
          {count}
        </span>
        <div className="ml-2 h-px flex-1 bg-border/40" />
      </button>
      {brand && (
        <Link
          href={`/channels/${brand.channelId}`}
          className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2"
        >
          {brand.name}
        </Link>
      )}
    </div>
  )
}
