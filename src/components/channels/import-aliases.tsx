'use client'

import { useState, useTransition } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addImportAlias, removeImportAlias } from '@/lib/actions/channel-actions'
import { toast } from 'sonner'

type ImportAliasesProps = {
  channelId: string
  aliases: string[]
}

export function ImportAliases({ channelId, aliases }: ImportAliasesProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [newAlias, setNewAlias] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!newAlias.trim()) return
    startTransition(async () => {
      const result = await addImportAlias(channelId, newAlias.trim())
      if (result.success) {
        toast.success('Import alias added')
        setNewAlias('')
        setShowAdd(false)
      } else {
        toast.error(result.error ?? 'Failed to add alias')
      }
    })
  }

  function handleRemove(alias: string) {
    startTransition(async () => {
      const result = await removeImportAlias(channelId, alias)
      if (result.success) {
        toast.success('Import alias removed')
      } else {
        toast.error(result.error ?? 'Failed to remove alias')
      }
    })
  }

  return (
    <div>
      {aliases.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {aliases.map((alias) => (
            <span
              key={alias}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/50 px-2.5 py-0.5 text-xs font-medium"
            >
              {alias}
              <button
                onClick={() => handleRemove(alias)}
                disabled={isPending}
                className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors"
                aria-label={`Remove alias ${alias}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground/70">No import aliases configured</p>
      )}

      {showAdd ? (
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Alias as it appears in import files"
            className="h-8 text-sm"
            autoFocus
          />
          <Button size="sm" onClick={handleAdd} disabled={isPending || !newAlias.trim()}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewAlias('') }}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowAdd(true)}
          className="mt-2"
        >
          <Plus size={12} />
          Add Alias
        </Button>
      )}
    </div>
  )
}
