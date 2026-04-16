'use client'

import { useState } from 'react'
import { Save, FolderOpen, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type ArchiveSettingsProps = {
  photosetRoots: string[]
  videosetRoots: string[]
}

type RootListEditorProps = {
  label: string
  roots: string[]
  onChange: (roots: string[]) => void
}

function RootListEditor({ label, roots, onChange }: RootListEditorProps) {
  function update(idx: number, value: string) {
    const next = [...roots]
    next[idx] = value
    onChange(next)
  }

  function remove(idx: number) {
    onChange(roots.filter((_, i) => i !== idx))
  }

  function add() {
    onChange([...roots, ''])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FolderOpen size={15} className="shrink-0 text-muted-foreground" />
        <span className="w-28 shrink-0 text-sm font-medium">{label}</span>
      </div>
      <div className="space-y-1.5 pl-[23px]">
        {roots.length === 0 && (
          <p className="text-xs text-muted-foreground/60 italic">No roots configured</p>
        )}
        {roots.map((root, idx) => (
          <div key={idx} className="flex items-center gap-1.5">
            <Input
              value={root}
              onChange={(e) => update(idx, e.target.value)}
              placeholder={label === 'Photoset roots' ? 'e.g. x:\\Sites\\' : 'e.g. m:\\VSites\\'}
              className="h-8 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              className={cn(
                'shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-muted hover:text-destructive',
                'transition-colors',
              )}
              aria-label="Remove root"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={12} />
          Add root
        </button>
      </div>
    </div>
  )
}

export function ArchiveSettings({ photosetRoots: initialPhoto, videosetRoots: initialVideo }: ArchiveSettingsProps) {
  const [photoRoots, setPhotoRoots] = useState<string[]>(initialPhoto)
  const [videoRoots, setVideoRoots] = useState<string[]>(initialVideo)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/archive-roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photosetRoot: JSON.stringify(photoRoots.filter(Boolean)),
          videosetRoot: JSON.stringify(videoRoots.filter(Boolean)),
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast.success('Archive roots saved')
    } catch {
      toast.error('Failed to save archive roots')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <RootListEditor
          label="Photoset roots"
          roots={photoRoots}
          onChange={setPhotoRoots}
        />
        <RootListEditor
          label="Videoset roots"
          roots={videoRoots}
          onChange={setVideoRoots}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Full paths to the root folders for each archive type. Multiple roots are supported.
        Used to auto-suggest archive paths for sets. Trailing separator is optional.
      </p>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        <Save size={14} />
        {saving ? 'Saving…' : 'Save roots'}
      </Button>
    </div>
  )
}
