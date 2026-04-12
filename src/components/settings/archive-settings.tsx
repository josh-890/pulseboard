'use client'

import { useState } from 'react'
import { Save, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

type ArchiveSettingsProps = {
  photosetRoot: string
  videosetRoot: string
}

export function ArchiveSettings({ photosetRoot, videosetRoot }: ArchiveSettingsProps) {
  const [photo, setPhoto] = useState(photosetRoot)
  const [video, setVideo] = useState(videosetRoot)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/archive-roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photosetRoot: photo, videosetRoot: video }),
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
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <FolderOpen size={16} className="shrink-0 text-muted-foreground" />
          <div className="flex flex-1 items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-medium">Photoset root</span>
            <Input
              value={photo}
              onChange={(e) => setPhoto(e.target.value)}
              placeholder="e.g. x:\Sites\"
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <FolderOpen size={16} className="shrink-0 text-muted-foreground" />
          <div className="flex flex-1 items-center gap-2">
            <span className="w-28 shrink-0 text-sm font-medium">Videoset root</span>
            <Input
              value={video}
              onChange={(e) => setVideo(e.target.value)}
              placeholder="e.g. m:\VSites\"
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Full path to the root folder for each archive type. Used to auto-suggest archive paths for sets.
        Trailing separator is optional.
      </p>
      <Button size="sm" onClick={handleSave} disabled={saving}>
        <Save size={14} />
        {saving ? 'Saving…' : 'Save roots'}
      </Button>
    </div>
  )
}
