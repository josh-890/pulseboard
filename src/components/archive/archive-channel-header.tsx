'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  channel: string
  count: number
  collapsed: boolean
  onToggle: () => void
}

export function ArchiveChannelHeader({ channel, count, collapsed, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/40"
    >
      {collapsed
        ? <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        : <ChevronDown  size={14} className="shrink-0 text-muted-foreground" />
      }
      <span className="text-sm font-semibold">{channel}</span>
      <span className={cn(
        'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
        'bg-muted/60 text-muted-foreground',
      )}>
        {count}
      </span>
      <div className="ml-2 h-px flex-1 bg-border/40" />
    </button>
  )
}
