'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ImportItem } from '@/generated/prisma/client'
import { Button } from '@/components/ui/button'
import { ImportStatusBadge } from './import-status-badge'
import {
  Check,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Info,
  Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonComparisonGrid } from './person-comparison-grid'

type ImportItemDetailProps = {
  item: ImportItem
  onImport: (itemId: string) => Promise<void>
  onSkip: (itemId: string) => Promise<void>
  onSaveEdits: (itemId: string, editedData: Record<string, unknown>) => Promise<void>
  isImporting: boolean
}

function FieldRow({
  label,
  value,
  className,
}: {
  label: string
  value: string | number | boolean | null | undefined
  className?: string
}) {
  if (value === null || value === undefined || value === '') return null
  const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)

  return (
    <div className={cn('flex items-start gap-3 py-1.5', className)}>
      <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{display}</span>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-4 mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  )
}

export function ImportItemDetail({
  item,
  onImport,
  onSkip,
  onSaveEdits,
  isImporting,
}: ImportItemDetailProps) {
  const data = (item.editedData ?? item.data) as Record<string, unknown>
  const isActionable =
    item.status === 'NEW' || item.status === 'MATCHED' || item.status === 'PROBABLE'
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{getItemTitle(item)}</h2>
            <ImportStatusBadge status={item.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            Type: {item.type.replace(/_/g, ' ')}
          </p>
        </div>

        {isActionable && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSkip(item.id)}
              disabled={isImporting}
            >
              <X size={14} />
              Skip
            </Button>
            <Button
              size="sm"
              onClick={() => onImport(item.id)}
              disabled={isImporting}
            >
              {isImporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Import
            </Button>
          </div>
        )}
      </div>

      {/* Match info */}
      {item.matchDetails && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-start gap-2">
            <Info size={14} className="mt-0.5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                {item.matchDetails}
              </p>
              {item.matchConfidence && (
                <p className="text-xs text-muted-foreground">
                  Confidence: {(item.matchConfidence * 100).toFixed(0)}%
                </p>
              )}
              {item.matchedEntityId && (
                <p className="text-xs text-muted-foreground">
                  Entity ID: {item.matchedEntityId}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Blocked reason */}
      {item.status === 'BLOCKED' && item.blockedReason && (
        <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={14}
              className="mt-0.5 shrink-0 text-orange-500"
            />
            <div>
              <p className="text-sm font-medium text-orange-700 dark:text-orange-400">
                Blocked
              </p>
              <p className="text-xs text-muted-foreground">
                {item.blockedReason}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Imported success */}
      {item.status === 'IMPORTED' && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
            <Check size={14} />
            Successfully imported
            {item.matchedEntityId && (
              <span className="text-xs text-muted-foreground">
                (ID: {item.matchedEntityId})
              </span>
            )}
          </div>
        </div>
      )}

      {/* Data fields */}
      <div className="rounded-lg border border-border/50 bg-card/50 p-4">
        {item.type === 'PERSON' && (
          <PersonDetailEditable
            item={item}
            data={data}
            isActionable={isActionable}
            onSaveEdits={onSaveEdits}
          />
        )}
        {item.type === 'PERSON_ALIAS' && <AliasDetail data={data} />}
        {item.type === 'DIGITAL_IDENTITY' && <IdentityDetail data={data} />}
        {(item.type === 'CHANNEL' || item.type === 'LABEL') && (
          <ChannelDetail data={data} />
        )}
        {item.type === 'SET' && <SetDetail data={data} />}
        {item.type === 'CO_MODEL' && <CoModelDetail data={data} />}
        {item.type === 'CREDIT' && <CreditDetail data={data} />}
      </div>

      {/* Duplicate warning for sets */}
      {item.type === 'SET' && (data.duplicateOf as unknown[])?.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle
              size={14}
              className="mt-0.5 shrink-0 text-amber-500"
            />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Possible duplicate
              </p>
              <p className="text-xs text-muted-foreground">
                This set may also appear as:
              </p>
              <ul className="mt-1 space-y-0.5">
                {(data.duplicateOf as Array<{ title: string; channel: string; externalId: string }>).map(
                  (d, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {d.title} @ {d.channel} (ID: {d.externalId})
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Person detail — editable form ─────────────────────────────────────────

// All source field keys the import executor reads from person data.
const PERSON_FIELD_KEYS = [
  'icgId', 'name', 'birthMonth', 'birthYear', 'nationality',
  'activeFromYear', 'retiredYear', 'heightCm', 'hairColor',
  'measurements', 'breastDescription', 'tattoos', 'activities',
  'biography', 'biographies',
] as const

function getFieldStringValue(data: Record<string, unknown>, key: string): string {
  const val = data[key]
  if (val === null || val === undefined) return ''
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}

function PersonDetailEditable({
  item,
  data,
  isActionable,
  onSaveEdits,
}: {
  item: ImportItem
  data: Record<string, unknown>
  isActionable: boolean
  onSaveEdits: (itemId: string, editedData: Record<string, unknown>) => Promise<void>
}) {
  const originalData = item.data as Record<string, unknown>
  const matchedEntityId = item.matchedEntityId

  // Build initial field values from current data (editedData ?? data)
  const buildFieldValues = useCallback(() => {
    const values: Record<string, string> = {}
    for (const key of PERSON_FIELD_KEYS) {
      values[key] = getFieldStringValue(data, key)
    }
    return values
  }, [data])

  const [fields, setFields] = useState<Record<string, string>>(buildFieldValues)
  const [isSaving, setIsSaving] = useState(false)

  // Reset fields when item changes (different item selected)
  useEffect(() => {
    setFields(buildFieldValues())
  }, [item.id, buildFieldValues])

  // Check if any field was modified
  const hasChanges = PERSON_FIELD_KEYS.some(
    (key) => fields[key] !== getFieldStringValue(data, key),
  )

  const handleChange = useCallback((key: string, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleClear = useCallback((key: string) => {
    setFields((prev) => ({ ...prev, [key]: '' }))
  }, [])

  const handleRestore = useCallback(
    (key: string) => {
      setFields((prev) => ({
        ...prev,
        [key]: getFieldStringValue(originalData, key),
      }))
    },
    [originalData],
  )

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    try {
      const editedData: Record<string, unknown> = { ...data }
      for (const key of PERSON_FIELD_KEYS) {
        const val = fields[key]
        if (val === '') {
          editedData[key] = null
        } else if (key === 'heightCm') {
          const num = parseInt(val, 10)
          editedData[key] = isNaN(num) ? null : num
        } else {
          editedData[key] = val
        }
      }
      await onSaveEdits(item.id, editedData)
    } finally {
      setIsSaving(false)
    }
  }, [fields, data, item.id, onSaveEdits])

  return (
    <>
      <PersonComparisonGrid
        matchedEntityId={matchedEntityId}
        fields={fields}
        originalData={originalData}
        isActionable={isActionable}
        isSaving={isSaving}
        onChange={handleChange}
        onClear={handleClear}
        onRestore={handleRestore}
      />

      {isActionable && hasChanges && (
        <div className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            Save Changes
          </Button>
          <span className="text-xs text-muted-foreground">
            Unsaved edits
          </span>
        </div>
      )}
    </>
  )
}

// ─── Type-specific detail views (read-only) ────────────────────────────────

function AliasDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <FieldRow label="Name" value={data.name as string} />
      {data.channelName && (
        <FieldRow label="Channel" value={data.channelName as string} />
      )}
    </>
  )
}

function IdentityDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <FieldRow label="Platform" value={data.platform as string} />
      {data.handle && <FieldRow label="Handle" value={data.handle as string} />}
      {data.url && (
        <div className="flex items-start gap-3 py-1.5">
          <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
            URL
          </span>
          <a
            href={data.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {(data.url as string).slice(0, 60)}
            <ExternalLink size={10} />
          </a>
        </div>
      )}
    </>
  )
}

function ChannelDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <FieldRow label="Name" value={data.name as string} />
    </>
  )
}

function SetDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <SectionHeader>Set Info</SectionHeader>
      <FieldRow label="Title" value={data.title as string} />
      <FieldRow label="Long title" value={data.longTitle as string} />
      <FieldRow label="External ID" value={data.externalId as string} />
      <FieldRow label="Channel" value={data.channelName as string} />
      <FieldRow label="Date" value={data.date as string} />
      <FieldRow
        label="Type"
        value={(data.isVideo as boolean) ? 'Video' : 'Photo'}
      />
      <FieldRow label="Images" value={data.imageCount as number} />
      <FieldRow label="Description" value={data.description as string} />
      <FieldRow label="Artist" value={data.artist as string} />

      {(data.modelsList as Array<{ name: string; icgId: string }>)?.length > 0 && (
        <>
          <SectionHeader>Models ({data.modelsCount as number})</SectionHeader>
          {(
            data.modelsList as Array<{ name: string; icgId: string }>
          ).map((m, i) => (
            <FieldRow
              key={i}
              label={`Model ${i + 1}`}
              value={`${m.name} (${m.icgId})`}
            />
          ))}
        </>
      )}

      {data.coverImageUrl && (
        <>
          <SectionHeader>Cover</SectionHeader>
          <FieldRow label="Alt text" value={data.coverImageAlt as string} />
        </>
      )}
    </>
  )
}

function CoModelDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <FieldRow label="Name" value={data.name as string} />
      <FieldRow label="ICG-ID" value={data.icgId as string} />
      {data.url && (
        <div className="flex items-start gap-3 py-1.5">
          <span className="w-28 shrink-0 text-xs font-medium text-muted-foreground">
            URL
          </span>
          <a
            href={data.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
          >
            {(data.url as string).slice(0, 60)}
            <ExternalLink size={10} />
          </a>
        </div>
      )}
    </>
  )
}

function CreditDetail({ data }: { data: Record<string, unknown> }) {
  return (
    <>
      <FieldRow label="Artist" value={data.name as string} />
    </>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getItemTitle(item: ImportItem): string {
  const data = item.data as Record<string, unknown>
  switch (item.type) {
    case 'PERSON':
      return `${data.name} (${data.icgId})`
    case 'PERSON_ALIAS':
      return data.name as string
    case 'DIGITAL_IDENTITY':
      return data.platform as string
    case 'CHANNEL':
    case 'LABEL':
      return data.name as string
    case 'SET':
      return data.title as string
    case 'CO_MODEL':
      return `${data.name} (${data.icgId})`
    case 'CREDIT':
      return data.name as string
    default:
      return 'Unknown'
  }
}
