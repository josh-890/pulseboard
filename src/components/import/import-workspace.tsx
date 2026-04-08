'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { ImportBatch, ImportItem } from '@/generated/prisma/client'
import {
  User,
  Users,
  Radio,
  ImageIcon,
  Globe,
  Tag,
  RefreshCw,
  ChevronLeft,
  Loader2,
  ArrowRight,
  Play,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ImportStatusBadge } from './import-status-badge'
import { ImportItemDetail } from './import-item-detail'
import { ChannelResolution } from './channel-resolution'
import { SetBatchSummary } from './set-batch-summary'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type ImportBatchWithItems = ImportBatch & { items: ImportItem[] }

type ImportWorkspaceProps = {
  batch: ImportBatchWithItems
}

type EntityTab = 'PERSON' | 'PERSON_ALIAS' | 'DIGITAL_IDENTITY' | 'CHANNEL' | 'SET' | 'CO_MODEL'

const TAB_CONFIG: Array<{ type: EntityTab; label: string; icon: React.ReactNode }> = [
  { type: 'PERSON', label: 'Person', icon: <User size={14} /> },
  { type: 'DIGITAL_IDENTITY', label: 'Identities', icon: <Globe size={14} /> },
  { type: 'CHANNEL', label: 'Channels', icon: <Radio size={14} /> },
  { type: 'PERSON_ALIAS', label: 'Aliases', icon: <Tag size={14} /> },
  { type: 'SET', label: 'Sets', icon: <ImageIcon size={14} /> },
  { type: 'CO_MODEL', label: 'Co-Models', icon: <Users size={14} /> },
]

export function ImportWorkspace({ batch }: ImportWorkspaceProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<EntityTab>('PERSON')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importingItemId, setImportingItemId] = useState<string | null>(null)
  // Group items by type
  const itemsByType = useMemo(() => {
    const groups: Record<string, ImportItem[]> = {}
    for (const item of batch.items) {
      const key = item.type
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return groups
  }, [batch.items])

  const currentItems = useMemo(() => {
    const items = itemsByType[activeTab] || []
    if (activeTab === 'SET') {
      return [...items].sort((a, b) => {
        const dateA = (a.data as Record<string, unknown>).date as string | null
        const dateB = (b.data as Record<string, unknown>).date as string | null
        if (!dateA && !dateB) return 0
        if (!dateA) return 1
        if (!dateB) return -1
        return dateA.localeCompare(dateB)
      })
    }
    return items
  }, [itemsByType, activeTab])
  const selectedItem = selectedItemId
    ? batch.items.find((i) => i.id === selectedItemId)
    : null

  // Per-tab status: how many items are importable vs blocked/done
  const tabStatus = useMemo(() => {
    const result: Record<string, { ready: number; blocked: number; done: number }> = {}
    for (const item of batch.items) {
      if (!result[item.type]) result[item.type] = { ready: 0, blocked: 0, done: 0 }
      // SET items are always sent to staging workspace on batch creation — treat as done
      if (item.type === 'SET') {
        result[item.type].done++
      } else if (item.status === 'NEW' || item.status === 'MATCHED' || item.status === 'PROBABLE') {
        result[item.type].ready++
      } else if (item.status === 'IMPORTED' || item.status === 'SKIPPED') {
        result[item.type].done++
      } else if (item.status === 'BLOCKED') {
        result[item.type].blocked++
      }
    }
    return result
  }, [batch.items])

  // Refresh matches
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await fetch(`/api/import/${batch.id}/refresh`, { method: 'POST' })
      router.refresh()
    } finally {
      setIsRefreshing(false)
    }
  }, [batch.id, router])

  // Import single item
  const handleImportItem = useCallback(
    async (itemId: string) => {
      setImportingItemId(itemId)
      setIsImporting(true)
      try {
        const res = await fetch(
          `/api/import/${batch.id}/items/${itemId}/import`,
          { method: 'POST' },
        )
        const result = await res.json()
        if (!result.success) {
          alert(`Import failed: ${result.error}`)
        }
        router.refresh()
      } finally {
        setIsImporting(false)
        setImportingItemId(null)
      }
    },
    [batch.id, router],
  )

  // Skip item
  const handleSkipItem = useCallback(
    async (itemId: string) => {
      await fetch(`/api/import/${batch.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'SKIPPED' }),
      })
      router.refresh()
    },
    [batch.id, router],
  )

  // Save edits to item data
  const handleSaveEdits = useCallback(
    async (itemId: string, editedData: Record<string, unknown>) => {
      await fetch(`/api/import/${batch.id}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editedData }),
      })
      router.refresh()
    },
    [batch.id, router],
  )

  // Import all ready items in the current tab
  const handleImportAllInTab = useCallback(async () => {
    const readyItems = currentItems
      .filter((i) => i.status === 'NEW' || i.status === 'PROBABLE')
      .sort((a, b) => a.sortOrder - b.sortOrder)

    if (readyItems.length === 0) return

    setIsImporting(true)
    for (const item of readyItems) {
      setImportingItemId(item.id)
      try {
        const res = await fetch(
          `/api/import/${batch.id}/items/${item.id}/import`,
          { method: 'POST' },
        )
        const result = await res.json()
        if (!result.success) {
          alert(`Import failed: ${result.error}`)
          break
        }
      } catch (err) {
        alert(`Import error: ${err}`)
        break
      }
    }
    setIsImporting(false)
    setImportingItemId(null)
    router.refresh()
  }, [currentItems, batch.id, router])

  // Count importable items in current tab
  const tabReadyCount = useMemo(
    () => currentItems.filter((i) => i.status === 'NEW' || i.status === 'PROBABLE').length,
    [currentItems],
  )

  // Count identical (already matched) items in current tab
  const tabIdenticalCount = useMemo(
    () => currentItems.filter((i) => i.status === 'MATCHED').length,
    [currentItems],
  )

  // Person tab always has exactly 1 item — auto-select it, hide sidebar
  const isPersonTab = activeTab === 'PERSON' && currentItems.length === 1
  useEffect(() => {
    if (isPersonTab) {
      setSelectedItemId(currentItems[0].id)
    }
  }, [isPersonTab, currentItems])

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/import">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronLeft size={16} />
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">
                {batch.subjectName}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({batch.subjectIcgId})
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                {batch.extractionDate &&
                  `Extracted ${batch.extractionDate.toLocaleDateString()}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                size={14}
                className={cn(isRefreshing && 'animate-spin')}
              />
              Refresh
            </Button>
          </div>
        </div>

      </div>

      {/* Entity type tabs */}
      <div className="shrink-0 border-b border-border/50 px-4">
        <Tabs
          value={activeTab}
          onValueChange={(v: string) => {
            setActiveTab(v as EntityTab)
            setSelectedItemId(null)
          }}
        >
          <TabsList className="h-auto gap-1 bg-transparent p-0">
            {TAB_CONFIG.map(({ type, label, icon }) => {
              const count = (itemsByType[type] || []).length
              if (count === 0) return null
              const status = tabStatus[type]
              // Dot color: green if all done, blue if some ready, orange if all blocked, gray otherwise
              const dotColor = status?.done === count
                ? 'bg-emerald-500'
                : status?.ready > 0
                  ? 'bg-blue-500'
                  : status?.blocked > 0
                    ? 'bg-orange-500'
                    : 'bg-muted-foreground/50'
              return (
                <TabsTrigger
                  key={type}
                  value={type}
                  className="gap-1.5 rounded-lg px-3 py-1.5 text-xs data-[state=active]:bg-muted"
                >
                  {icon}
                  {label}
                  <span className="ml-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className={cn('inline-block h-1.5 w-1.5 rounded-full', dotColor)} />
                    {count}
                  </span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Tab action bar — shown when there are actionable items (not for SET tab — has own bulk actions) */}
      {!isPersonTab && activeTab !== 'SET' && (tabReadyCount > 0 || tabIdenticalCount > 0) && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-4 py-2">
          {tabReadyCount > 0 && (
            <Button
              size="sm"
              onClick={handleImportAllInTab}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Import All New ({tabReadyCount})
            </Button>
          )}
          {tabIdenticalCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-500">
              <Check size={12} />
              {tabIdenticalCount} already in database
            </span>
          )}
        </div>
      )}

      {/* Split panel: item list + detail */}
      {/* SET tab shows summary card with link to staging workspace */}
      {activeTab === 'SET' ? (
        <SetBatchSummary batch={batch} />
      ) : (
      <div className="flex min-h-0 flex-1">
        {/* Left: Item list (hidden for Person tab — always 1 item) */}
        {!isPersonTab && <div className="w-80 shrink-0 overflow-y-auto border-r border-border/50 lg:w-96">
          {currentItems.map((item) => {
            const data = item.data as Record<string, unknown>
            const isActive = selectedItemId === item.id
            const isCurrentlyImporting = importingItemId === item.id

            let displayName = ''
            switch (item.type) {
              case 'PERSON':
                displayName = `${data.name} (${data.icgId})`
                break
              case 'PERSON_ALIAS':
                displayName = data.name as string
                if (data.channelName)
                  displayName += ` @ ${data.channelName}`
                break
              case 'DIGITAL_IDENTITY':
                displayName = `${data.platform}: ${data.url ? (data.url as string).slice(0, 40) : data.handle}`
                break
              case 'CHANNEL':
              case 'LABEL':
                displayName = data.name as string
                break
              case 'SET': {
                const dateStr = data.date as string | null
                displayName = `${dateStr ?? '????-??-??'} ${data.channelName}`
                break
              }
              case 'CO_MODEL':
                displayName = `${data.name} (${data.icgId})`
                break
              case 'CREDIT':
                displayName = data.name as string
                break
            }

            return (
              <button
                key={item.id}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                  isActive && 'bg-muted',
                )}
                onClick={() => setSelectedItemId(item.id)}
              >
                <div className="min-w-0 flex-1">
                  {item.type === 'SET' ? (
                    <>
                      <p className="truncate text-xs text-muted-foreground">{displayName}</p>
                      <p className="truncate text-sm">{(data.title as string)}</p>
                    </>
                  ) : (
                    <p className="truncate text-sm">{displayName}</p>
                  )}
                  {item.matchDetails && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {item.matchDetails}
                    </p>
                  )}
                  {item.blockedReason && (
                    <p className="truncate text-[10px] text-orange-500">
                      {item.blockedReason}
                    </p>
                  )}
                  {/* Duplicate flag for sets */}
                  {item.type === 'SET' && (data.duplicateOf as unknown[])?.length > 0 && (
                    <p className="text-[10px] text-amber-500">
                      Possible duplicate
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {isCurrentlyImporting ? (
                    <Loader2 size={12} className="animate-spin text-primary" />
                  ) : (
                    <ImportStatusBadge
                      status={item.status}
                      showLabel={false}
                    />
                  )}
                </div>
              </button>
            )
          })}

          {currentItems.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No items in this category
            </div>
          )}
        </div>}

        {/* Right: Detail panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedItem ? (
            selectedItem.type === 'CHANNEL' ? (
              <ChannelResolution
                item={selectedItem}
                onResolved={() => router.refresh()}
              />
            ) : (
              <ImportItemDetail
                item={selectedItem}
                onImport={handleImportItem}
                onSkip={handleSkipItem}
                onSaveEdits={handleSaveEdits}
                isImporting={importingItemId === selectedItem.id}
              />
            )
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <div className="text-center">
                <ArrowRight size={24} className="mx-auto mb-2 opacity-30" />
                Select an item to view details
              </div>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}
