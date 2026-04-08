import { cn } from '@/lib/utils'
import { Check, Clock, AlertTriangle, X, Loader2, Ban, HelpCircle } from 'lucide-react'

type ImportStatusBadgeProps = {
  status: string
  className?: string
  showLabel?: boolean
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  NEW: {
    label: 'New',
    color: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
    icon: <Clock size={10} />,
  },
  MATCHED: {
    label: 'Matched',
    color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
    icon: <Check size={10} />,
  },
  PROBABLE: {
    label: 'Probable',
    color: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
    icon: <HelpCircle size={10} />,
  },
  BLOCKED: {
    label: 'Blocked',
    color: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
    icon: <AlertTriangle size={10} />,
  },
  QUEUED: {
    label: 'Queued',
    color: 'bg-purple-500/15 text-purple-500 border-purple-500/20',
    icon: <Clock size={10} />,
  },
  IMPORTING: {
    label: 'Importing',
    color: 'bg-primary/15 text-primary border-primary/20',
    icon: <Loader2 size={10} className="animate-spin" />,
  },
  PARTIAL: {
    label: 'In Progress',
    color: 'bg-blue-500/15 text-blue-500 border-blue-500/20',
    icon: <Clock size={10} />,
  },
  IMPORTED: {
    label: 'Imported',
    color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
    icon: <Check size={10} />,
  },
  SKIPPED: {
    label: 'Skipped',
    color: 'bg-muted text-muted-foreground border-border/50',
    icon: <Ban size={10} />,
  },
  FAILED: {
    label: 'Failed',
    color: 'bg-destructive/15 text-destructive border-destructive/20',
    icon: <X size={10} />,
  },
}

export function ImportStatusBadge({
  status,
  className,
  showLabel = true,
}: ImportStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.NEW

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        config.color,
        className,
      )}
    >
      {config.icon}
      {showLabel && config.label}
    </span>
  )
}
