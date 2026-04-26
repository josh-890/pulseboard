'use client'

import { useState, useTransition } from 'react'
import { Check, Circle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toggleSetComplete } from '@/lib/actions/set-actions'

type SetCompleteBadgeProps = {
  setId: string
  isComplete: boolean
}

export function SetCompleteBadge({ setId, isComplete }: SetCompleteBadgeProps) {
  const [optimistic, setOptimistic] = useState(isComplete)
  const [isPending, startTransition] = useTransition()

  const toggle = () => {
    const next = !optimistic
    setOptimistic(next)
    startTransition(async () => {
      const result = await toggleSetComplete(setId, next)
      if (!result.success) {
        setOptimistic(!next) // revert on failure
      }
    })
  }

  return (
    <button
      onClick={toggle}
      disabled={isPending}
      title={optimistic ? 'Mark as incomplete' : 'Mark as complete'}
      className={cn(
        'inline-flex items-center gap-1 transition-colors',
        'hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-50',
        optimistic
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-amber-600 dark:text-amber-400',
      )}
    >
      {isPending ? (
        <Loader2 size={12} className="animate-spin" />
      ) : optimistic ? (
        <Check size={12} />
      ) : (
        <Circle size={12} />
      )}
      {optimistic ? 'Complete' : 'Incomplete'}
    </button>
  )
}
