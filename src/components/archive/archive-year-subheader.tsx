'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'

type Props = {
  year: string
  count: number
  collapsed: boolean
  onToggle: () => void
}

export function ArchiveYearSubheader({ year, count, collapsed, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-6 py-1 text-left transition-colors hover:bg-muted/30"
    >
      {collapsed
        ? <ChevronRight size={11} className="shrink-0 text-muted-foreground/60" />
        : <ChevronDown  size={11} className="shrink-0 text-muted-foreground/60" />
      }
      <span className="text-xs font-medium text-muted-foreground">{year}</span>
      <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/70">
        {count}
      </span>
    </button>
  )
}
