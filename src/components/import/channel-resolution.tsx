'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Link2, Check, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ImportItem } from '@/generated/prisma/client'
import { cn } from '@/lib/utils'

type Suggestion = {
  id: string
  name: string
  similarity?: number
  label?: string | null
}

type LabelOption = {
  id: string
  name: string
}

type ChannelResolutionProps = {
  item: ImportItem
  onResolved: () => void
}

export function ChannelResolution({ item, onResolved }: ChannelResolutionProps) {
  const data = item.data as Record<string, unknown>
  const channelName = data.name as string

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searchResults, setSearchResults] = useState<Suggestion[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isLinking, setIsLinking] = useState<string | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  // Create new channel state
  const [showCreate, setShowCreate] = useState(false)
  const [labels, setLabels] = useState<LabelOption[]>([])
  const [newChannelName, setNewChannelName] = useState(channelName)
  const [newChannelShortName, setNewChannelShortName] = useState('')
  const [isShortNameSuggestion, setIsShortNameSuggestion] = useState(true)
  const [shortNameAvailable, setShortNameAvailable] = useState<boolean | null>(null)
  const [newChannelLabelId, setNewChannelLabelId] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shortNameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shortNameSuggestRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load fuzzy suggestions on mount
  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/import/channels/suggest?name=${encodeURIComponent(channelName)}`)
      .then((r) => r.json())
      .then((data: Suggestion[]) => {
        setSuggestions(data)
        setIsLoading(false)
      })
      .catch(() => setIsLoading(false))
  }, [channelName])

  // Debounced search while typing
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      return
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const res = await fetch(
          `/api/import/channels/suggest?q=${encodeURIComponent(searchQuery)}`,
        )
        const data = await res.json()
        setSearchResults(data)
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchQuery])

  // Load labels and fetch initial shortName suggestion when "Create New" is opened
  useEffect(() => {
    if (!showCreate) return
    if (labels.length === 0) {
      fetch('/api/labels')
        .then((r) => r.json())
        .then((data: LabelOption[]) => setLabels(data))
        .catch(() => {})
    }
    // Fetch unique shortName suggestion for the initial name
    if (newChannelName.trim() && !newChannelShortName) {
      fetch(`/api/channels/short-name?name=${encodeURIComponent(newChannelName.trim())}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.suggestion) {
            setNewChannelShortName(data.suggestion)
            setIsShortNameSuggestion(true)
            setShortNameAvailable(true)
          }
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreate])

  // Check shortName availability when it changes
  useEffect(() => {
    if (!newChannelShortName.trim()) {
      setShortNameAvailable(null)
      return
    }
    if (shortNameCheckRef.current) clearTimeout(shortNameCheckRef.current)
    shortNameCheckRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/channels/short-name?check=${encodeURIComponent(newChannelShortName.trim())}`)
        const data = await res.json()
        setShortNameAvailable(data.available)
      } catch {
        setShortNameAvailable(null)
      }
    }, 300)
    return () => { if (shortNameCheckRef.current) clearTimeout(shortNameCheckRef.current) }
  }, [newChannelShortName])

  // Link handler
  const handleLink = useCallback(
    async (channelId: string) => {
      setIsLinking(channelId)
      try {
        await fetch('/api/import/channels/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            itemId: item.id,
            channelId,
            importName: channelName,
          }),
        })
        onResolved()
      } finally {
        setIsLinking(null)
      }
    },
    [item.id, channelName, onResolved],
  )

  // Create + link handler
  const handleCreateAndLink = useCallback(async () => {
    if (!newChannelName.trim() || !newChannelLabelId) return
    setIsCreating(true)
    try {
      const res = await fetch('/api/import/channels/create-and-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: item.id,
          name: newChannelName.trim(),
          shortName: newChannelShortName.trim() || undefined,
          labelId: newChannelLabelId,
          importName: channelName,
        }),
      })
      const result = await res.json()
      if (result.success) {
        onResolved()
      }
    } finally {
      setIsCreating(false)
    }
  }, [item.id, channelName, newChannelName, newChannelShortName, newChannelLabelId, onResolved])

  // Already resolved
  if (item.status === 'MATCHED' || item.status === 'IMPORTED') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Channel: {channelName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{item.matchDetails}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <Check size={16} className="text-emerald-500" />
          <span className="text-sm text-emerald-400">
            Resolved — linked to existing channel
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium">
          Resolve Channel: <span className="text-primary">{channelName}</span>
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Link this import name to an existing channel, or create a new one.
        </p>
        {item.blockedReason && (
          <p className="mt-1 text-xs text-orange-500">{item.blockedReason}</p>
        )}
      </div>

      {/* Fuzzy suggestions */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Suggestions
        </h4>
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Finding similar channels...
          </div>
        ) : suggestions.length > 0 ? (
          <div className="space-y-1">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.similarity !== undefined && (
                    <p className="text-[10px] text-muted-foreground">
                      Similarity: {Math.round(s.similarity * 100)}%
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleLink(s.id)}
                  disabled={isLinking !== null}
                  className="shrink-0"
                >
                  {isLinking === s.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Link2 size={12} />
                  )}
                  Link
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-2 text-xs text-muted-foreground">
            No similar channels found in database
          </p>
        )}
      </div>

      {/* Search */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Search
        </h4>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Type to search channels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border/50 bg-background/50 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
          />
          {isSearching && (
            <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 space-y-1">
            {searchResults.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{s.name}</p>
                  {s.label && (
                    <p className="text-[10px] text-muted-foreground">
                      Label: {s.label}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleLink(s.id)}
                  disabled={isLinking !== null}
                  className="shrink-0"
                >
                  {isLinking === s.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Link2 size={12} />
                  )}
                  Link
                </Button>
              </div>
            ))}
          </div>
        )}
        {searchQuery.trim() && !isSearching && searchResults.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No channels found for &ldquo;{searchQuery}&rdquo;
          </p>
        )}
      </div>

      {/* Create new channel */}
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Create New
        </h4>
        {!showCreate ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCreate(true)}
          >
            <Plus size={12} />
            Create New Channel
          </Button>
        ) : (
          <div className="space-y-3 rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex gap-2">
              <div className="flex-1 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Channel Name
                </label>
                <Input
                  value={newChannelName}
                  onChange={(e) => {
                    setNewChannelName(e.target.value)
                    // Auto-suggest shortName when name changes and user hasn't manually edited
                    if (isShortNameSuggestion) {
                      if (shortNameSuggestRef.current) clearTimeout(shortNameSuggestRef.current)
                      shortNameSuggestRef.current = setTimeout(async () => {
                        const val = e.target.value.trim()
                        if (!val) { setNewChannelShortName(''); return }
                        try {
                          const res = await fetch(`/api/channels/short-name?name=${encodeURIComponent(val)}`)
                          const data = await res.json()
                          if (data.suggestion) setNewChannelShortName(data.suggestion)
                        } catch { /* ignore */ }
                      }, 300)
                    }
                  }}
                  placeholder="Channel name"
                  className="h-8 text-sm"
                />
              </div>
              <div className="w-24 space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  Short
                </label>
                <Input
                  value={newChannelShortName}
                  onChange={(e) => {
                    setNewChannelShortName(e.target.value)
                    setIsShortNameSuggestion(false)
                  }}
                  onFocus={() => { if (isShortNameSuggestion) setIsShortNameSuggestion(false) }}
                  placeholder="FJ"
                  className={cn(
                    "h-8 text-sm",
                    isShortNameSuggestion && newChannelShortName && "italic !text-amber-500 dark:!text-amber-400 !border-amber-400/50 !bg-amber-500/5",
                  )}
                />
                {shortNameAvailable === false && (
                  <p className="text-[10px] text-destructive">Already taken</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Label <span className="text-destructive">*</span>
              </label>
              <select
                value={newChannelLabelId}
                onChange={(e) => setNewChannelLabelId(e.target.value)}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a label</option>
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleCreateAndLink}
                disabled={isCreating || !newChannelName.trim() || !newChannelLabelId || shortNameAvailable === false}
              >
                {isCreating ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Plus size={12} />
                )}
                Create & Link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowCreate(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
