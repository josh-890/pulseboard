import { cn } from '@/lib/utils'

type PersonIdentityProps = {
  name: string
  icgId: string
  className?: string
}

/**
 * A person, named the only way that identifies one: `Name (ICG-ID)`.
 *
 * A bare name is not an identity. The archive is full of aliases — there are
 * many people called "Alisa", and the folder alias `FJ | Alisa I` belongs to
 * exactly one of them (`AI-00QAS`). Anywhere the operator is deciding *which*
 * person to attach to something, the unique key has to be on screen, not in a
 * tooltip: a confirmation made against an ambiguous label is a wrong career
 * entry waiting to happen.
 *
 * Mirrors the `getDisplayName()` convention and the mono ICG-ID styling already
 * used in the connections tab and the contacts register.
 */
export function PersonIdentity({ name, icgId, className }: PersonIdentityProps) {
  // Suggestions for people with no catalogue folder of their own carry the
  // ICG-ID as their name. Printing "AI-00QAS (AI-00QAS)" helps nobody.
  const hasName = name && name !== icgId
  return (
    <span className={cn('inline-flex items-baseline gap-1', className)}>
      {hasName && <span className="truncate">{name}</span>}
      <span className={cn('font-mono text-[10px] opacity-70', !hasName && 'text-[11px] opacity-100')}>
        {hasName ? `(${icgId})` : icgId}
      </span>
    </span>
  )
}
