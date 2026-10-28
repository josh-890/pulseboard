import { cn } from '@/lib/utils'

type IdentityAvatarProps = {
  name: string | null
  avatarUrl: string | null
  /** A Contact gets the dashed frame (ADR-0038); unknown a faint amber one */
  kind: 'person' | 'contact' | 'unknown'
  size?: 'sm' | 'md'
  className?: string
}

/** A face, framed by what she is to the app: Person solid, Contact dashed, unknown amber */
export function IdentityAvatar({ name, avatarUrl, kind, size = 'sm', className }: IdentityAvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted/40',
        size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-9 w-9 text-xs',
        kind === 'person' && 'border border-white/30',
        kind === 'contact' && 'border border-dashed border-muted-foreground/60',
        kind === 'unknown' && 'border border-dashed border-amber-500/60',
        className,
      )}
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- MinIO URL, not a static asset
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="font-semibold text-muted-foreground">{(name ?? '?').charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}
