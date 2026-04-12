'use client'

import { useState, useCallback } from 'react'
import { Check, Pencil, X, Save, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { updateChannelFolderAction } from '@/lib/actions/channel-actions'
import { cn } from '@/lib/utils'

type ChannelFolderInlineProps = {
  channelId: string
  channelFolder: string | null
  /** Fallback suggestion: computed from shortName + channelName */
  suggestion: string
}

export function ChannelFolderInline({
  channelId,
  channelFolder: initialFolder,
  suggestion,
}: ChannelFolderInlineProps) {
  const [folder, setFolder] = useState(initialFolder)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(initialFolder ?? suggestion)
  const [isSaving, setIsSaving] = useState(false)

  const hasFolder = !!folder

  const handleConfirm = useCallback(async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setIsSaving(true)
    try {
      await updateChannelFolderAction(channelId, trimmed)
      setFolder(trimmed)
      setEditValue(trimmed)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }, [channelId])

  const handleClear = useCallback(async () => {
    setIsSaving(true)
    try {
      await updateChannelFolderAction(channelId, null)
      setFolder(null)
      setEditValue(suggestion)
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }, [channelId, suggestion])

  if (isEditing) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Archive folder name:</p>
        <div className="flex gap-2">
          <Input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder={suggestion}
            className="font-mono text-sm"
            autoFocus
          />
          <Button
            size="sm"
            onClick={() => handleConfirm(editValue)}
            disabled={isSaving || !editValue.trim()}
          >
            <Save size={13} /> Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { setIsEditing(false); setEditValue(folder ?? suggestion) }}
          >
            <X size={13} />
          </Button>
        </div>
      </div>
    )
  }

  if (hasFolder) {
    return (
      <div className="flex items-center gap-2">
        <FolderOpen size={14} className="shrink-0 text-muted-foreground" />
        <code className="flex-1 rounded bg-muted/50 px-2 py-1 font-mono text-sm text-foreground">
          {folder}
        </code>
        <button
          type="button"
          onClick={() => { setIsEditing(true); setEditValue(folder ?? '') }}
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Edit folder name"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={isSaving}
          className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
          title="Clear folder name"
        >
          <X size={13} />
        </button>
      </div>
    )
  }

  // No folder set — show suggestion with confirm / edit
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FolderOpen size={14} className="shrink-0 text-muted-foreground/60" />
        <code className={cn(
          'flex-1 rounded bg-muted/30 px-2 py-1 font-mono text-sm text-muted-foreground',
        )}>
          {suggestion}
        </code>
        <span className="shrink-0 rounded border border-dashed border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
          suggested
        </span>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => handleConfirm(suggestion)}
          disabled={isSaving}
        >
          <Check size={13} /> Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setIsEditing(true); setEditValue(suggestion) }}
        >
          <Pencil size={13} /> Edit
        </Button>
      </div>
    </div>
  )
}
