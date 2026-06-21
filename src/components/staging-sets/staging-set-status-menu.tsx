'use client'

import { useState } from 'react'
import { Check, X, Clock, Archive, RotateCcw, ChevronDown, Loader2, Rocket } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { StagingSetStatus } from '@/generated/prisma/client'

type Transition =
  | { kind: 'status'; label: string; to: StagingSetStatus; icon: typeof Check; danger?: boolean }
  | { kind: 'promote'; label: string; icon: typeof Check }

// Allowed quick transitions per status — mirrors the slide-panel actions.
// Promote stays a distinct (heavy) action; PROMOTED is terminal (no menu).
function transitionsFor(status: StagingSetStatus): Transition[] {
  const reviewing: Transition = { kind: 'status', label: 'Mark reviewing', to: 'REVIEWING', icon: Clock }
  const approve: Transition = { kind: 'status', label: 'Approve', to: 'APPROVED', icon: Check }
  const promote: Transition = { kind: 'promote', label: 'Promote', icon: Rocket }
  const inactive: Transition = { kind: 'status', label: 'Inactive', to: 'INACTIVE', icon: Archive }
  const skip: Transition = { kind: 'status', label: 'Skip', to: 'SKIPPED', icon: X, danger: true }
  const reactivate: Transition = { kind: 'status', label: 'Reactivate', to: 'PENDING', icon: RotateCcw }
  switch (status) {
    case 'PENDING': return [reviewing, approve, inactive, skip]
    case 'REVIEWING': return [approve, inactive, skip]
    case 'APPROVED': return [promote, reviewing, inactive, skip]
    case 'INACTIVE': return [reactivate]
    case 'SKIPPED': return [reactivate]
    case 'PROMOTED': return []
  }
}

// Inline quick-status control on a staging-set row: the status badge becomes a
// button that opens a small transition menu — no need to open the side panel.
export function StagingSetStatusMenu({
  id,
  status,
  badgeLabel,
  badgeClassName,
  onStatusChange,
  onPromote,
}: {
  id: string
  status: StagingSetStatus
  badgeLabel: string
  badgeClassName: string
  onStatusChange: (id: string, status: StagingSetStatus) => void | Promise<void>
  onPromote: (id: string) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const transitions = transitionsFor(status)

  // Terminal / no transitions → plain read-only badge.
  if (transitions.length === 0) {
    return (
      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', badgeClassName)}>
        {badgeLabel}
      </span>
    )
  }

  async function run(t: Transition) {
    setOpen(false)
    setBusy(true)
    try {
      if (t.kind === 'promote') await onPromote(id)
      else await onStatusChange(id, t.to)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o) }}
          title="Change status"
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            badgeClassName,
          )}
        >
          {busy ? <Loader2 size={10} className="animate-spin" /> : badgeLabel}
          <ChevronDown size={10} className="opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 p-1" onClick={(e) => e.stopPropagation()}>
        {transitions.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); void run(t) }}
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/10',
              t.kind === 'promote' && 'font-medium text-green-500',
              t.kind === 'status' && t.danger && 'text-muted-foreground',
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
