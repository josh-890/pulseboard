import type { ChannelTier } from '@/generated/prisma/client'

export const CHANNEL_TIER_CONFIG: Array<{
  value: ChannelTier
  letter: string
  label: string
  dot: string
  text: string
  border: string
  bg: string
}> = [
  { value: 'PREMIUM', letter: 'A', label: 'Premium', dot: 'bg-amber-500',  text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-500/15' },
  { value: 'HIGH',    letter: 'B', label: 'High',    dot: 'bg-blue-500',   text: 'text-blue-600 dark:text-blue-400',   border: 'border-blue-500/50',  bg: 'bg-blue-500/15' },
  { value: 'NORMAL',  letter: 'C', label: 'Normal',  dot: 'bg-gray-400',   text: 'text-gray-600 dark:text-gray-400',   border: 'border-gray-400/50',  bg: 'bg-gray-400/15' },
  { value: 'LOW',     letter: 'D', label: 'Low',     dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-400/50', bg: 'bg-slate-400/15' },
  { value: 'TRASH',   letter: 'E', label: 'Trash',   dot: 'bg-red-500',    text: 'text-red-600 dark:text-red-400',     border: 'border-red-500/50',   bg: 'bg-red-500/15' },
]

export const CHANNEL_TIER_VALUES = CHANNEL_TIER_CONFIG.map((t) => t.value)

export const DEFAULT_STAGING_TIERS: ChannelTier[] = ['PREMIUM', 'HIGH', 'NORMAL']
