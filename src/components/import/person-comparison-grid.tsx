'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { AlertTriangle, Plus, Pencil, Check, X, RotateCcw } from 'lucide-react'
import { parseBreastDescription, extractCupFromMeasurements } from '@/lib/services/import/import-utils'
import { IMPORT_SCALAR_ATTRS } from '@/lib/services/import/scalar-attrs'
import { resolveNationalityToIoc, toIocCode } from '@/lib/constants/countries'

// ─── Types ───────────────────────────────────────────────────────────────────

type BaselineAttribute = {
  value: string | null
  isVerifiedUnknown: boolean
  notes: string | null
  attributeStatus: string | null
}

type PersonCurrentData = {
  person: {
    icgId: string
    birthdate: string | null
    nationality: string | null
    height: number | null
    activeFrom: string | null
    retiredAt: string | null
    bio: string | null
    status: string
  }
  commonAlias: string | null
  baselineAttributes: Record<string, BaselineAttribute>
}

type ComparisonRow =
  | { kind: 'section'; section: string }
  | {
      kind: 'field'
      source: { key: string; label: string } | null
      sourceRef?: string
      target: {
        key: string
        label: string
        getValue: (d: PersonCurrentData) => string | null
        // Status-bearing rows (currently only breast_size) surface the
        // folded AttributeStatus as a pill next to the value.
        getStatusPill?: (d: PersonCurrentData) => string | null
      }
      changeMode: 'overwrite' | 'append'
      getPreview?: (fields: Record<string, string>) => string | null
    }
  // ADR-0008: annotation rows show context that isn't a decision — e.g. the
  // raw verbatim wording behind a parsed value. No change indicator, no
  // editable source cell.
  | {
      kind: 'annotation'
      source: { key: string; label: string }
      target: { label: string; getValue: (d: PersonCurrentData) => string | null }
    }

type ChangeType = 'overwrite' | 'set' | 'append' | 'match' | 'none'

type PersonComparisonGridProps = {
  matchedEntityId: string | null
  fields: Record<string, string>
  originalData: Record<string, unknown>
  isActionable: boolean
  isSaving: boolean
  onChange: (key: string, value: string) => void
  onClear: (key: string) => void
  onRestore: (key: string) => void
}

// ─── Preview helpers ─────────────────────────────────────────────────────────

function previewCupSize(f: Record<string, string>): string | null {
  return extractCupFromMeasurements(f.measurements ?? '') ?? (f.breastDescription ? parseBreastDescription(f.breastDescription).cupSize : null)
}

// Status-pill label derived from the AttributeStatus folded onto the baseline
// delta. The fold writes "NATURAL" / "ENHANCED" / "RESTORED"; render as the
// title-cased form a user expects on a pill.
function formatAttributeStatus(raw: string | null): string | null {
  if (!raw) return null
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

// ─── Row generator: Physical section ─────────────────────────────────────────

// Generates one ComparisonRow per scalar attribute the import parser can
// actually populate (parserKey defined). The grid hides rows whose source +
// target are both empty so attrs no parser produces today don't show up.
// For breast_size we additionally emit an annotation row carrying the raw
// source wording — it's context, not a decision.
function buildPhysicalAttributeRows(): ComparisonRow[] {
  const rows: ComparisonRow[] = []
  for (const attr of IMPORT_SCALAR_ATTRS) {
    if (!attr.parserKey) continue
    const slug = attr.slug
    const isBreastSize = slug === 'breast_size'
    rows.push({
      kind: 'field',
      source: { key: attr.parserKey, label: attr.name },
      target: {
        key: slug,
        label: attr.name,
        getValue: (d) => d.baselineAttributes[slug]?.value ?? null,
        ...(attr.statusBearing
          ? {
              getStatusPill: (d) =>
                formatAttributeStatus(d.baselineAttributes[slug]?.attributeStatus ?? null),
            }
          : {}),
      },
      changeMode: 'overwrite',
      // breast_size needs the parsed cup as the preview; everything else
      // shows the raw source value (handled by the generic fallback in the
      // main render loop).
      ...(isBreastSize ? { getPreview: previewCupSize } : {}),
    })
    if (isBreastSize) {
      rows.push({
        kind: 'annotation',
        source: { key: 'breastDescription', label: '↳ Description' },
        target: {
          label: 'Breast Description',
          getValue: (d) => d.baselineAttributes[slug]?.notes ?? null,
        },
      })
    }
  }
  return rows
}

// ─── Row definitions ─────────────────────────────────────────────────────────

const COMPARISON_ROWS: ComparisonRow[] = [
  // Identity
  { kind: 'section', section: 'Identity' },
  {
    kind: 'field',
    source: { key: 'icgId', label: 'ICG-ID' },
    target: { key: 'icgId', label: 'ICG ID', getValue: (d) => d.person.icgId },
    changeMode: 'overwrite',
  },
  {
    kind: 'field',
    source: { key: 'name', label: 'Name' },
    target: { key: 'commonAlias', label: 'Common Name', getValue: (d) => d.commonAlias },
    changeMode: 'overwrite',
  },
  // Personal
  { kind: 'section', section: 'Personal' },
  {
    kind: 'field',
    source: { key: 'birthMonth+birthYear', label: 'Birthday' },
    target: { key: 'birthdate', label: 'Birthdate', getValue: (d) => d.person.birthdate },
    changeMode: 'overwrite',
  },
  {
    kind: 'field',
    source: { key: 'nationality', label: 'Nationality' },
    target: { key: 'nationality', label: 'Nationality', getValue: (d) => d.person.nationality },
    changeMode: 'overwrite',
    getPreview: (f) => f.nationality ? resolveNationalityToIoc(f.nationality) ?? null : null,
  },
  {
    kind: 'field',
    source: { key: 'activeFromYear', label: 'Active from' },
    target: { key: 'activeFrom', label: 'Active From', getValue: (d) => d.person.activeFrom },
    changeMode: 'overwrite',
  },
  {
    kind: 'field',
    source: { key: 'retiredYear', label: 'Retired in' },
    target: { key: 'retiredAt', label: 'Retired At', getValue: (d) => d.person.retiredAt },
    changeMode: 'overwrite',
  },
  {
    kind: 'field',
    source: null,
    target: { key: 'status', label: 'Status', getValue: (d) => d.person.status },
    changeMode: 'overwrite',
    getPreview: (f) => f.retiredYear ? 'inactive' : 'active',
  },
  // Physical — one row per catalog attribute the parser can populate.
  // Height stays here because it's still a Person.height column (slated for
  // migration to a cattr-height ScalarDelta in a later catalog-cleanup slice).
  { kind: 'section', section: 'Physical' },
  {
    kind: 'field',
    source: { key: 'heightCm', label: 'Height (cm)' },
    target: {
      key: 'height',
      label: 'Height',
      getValue: (d) => (d.person.height != null ? `${d.person.height} cm` : null),
    },
    changeMode: 'overwrite',
  },
  ...buildPhysicalAttributeRows(),
  // Other
  { kind: 'section', section: 'Other' },
  {
    kind: 'field',
    source: { key: 'biography', label: 'Biography' },
    target: { key: 'bio', label: 'Bio', getValue: (d) => d.person.bio },
    changeMode: 'overwrite',
  },
  {
    kind: 'field',
    source: { key: 'biographies', label: 'Biographies' },
    target: { key: 'bio_append_biographies', label: '(appends to Bio)', getValue: (d) => d.person.bio },
    changeMode: 'append',
  },
  {
    kind: 'field',
    source: { key: 'tattoos', label: 'Tattoos' },
    target: { key: 'bio_append_tattoos', label: '(appends to Bio)', getValue: (d) => d.person.bio },
    changeMode: 'append',
  },
  {
    kind: 'field',
    source: { key: 'activities', label: 'Activities' },
    target: { key: 'bio_append_activities', label: '(appends to Bio)', getValue: (d) => d.person.bio },
    changeMode: 'append',
  },
]

// ─── Change detection ────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

function normalizeValue(s: string): string {
  return s.trim().toLowerCase()
}

function valuesMatch(
  sourceValue: string,
  dbValue: string,
  targetKey: string,
): boolean {
  const src = normalizeValue(sourceValue)
  const db = normalizeValue(dbValue)
  if (src === db) return true

  // Height: "168" vs "168 cm"
  if (targetKey === 'height') {
    return db === `${src} cm`
  }

  // Nationality: normalize both sides to IOC code (e.g. "DE" → "GER", "Germany" → "GER")
  if (targetKey === 'nationality') {
    const srcIoc = resolveNationalityToIoc(sourceValue)
    const dbIoc = dbValue.length === 2 ? toIocCode(dbValue) : resolveNationalityToIoc(dbValue)
    if (srcIoc && dbIoc && srcIoc === dbIoc) return true
  }

  return false
}

function birthdateMatches(
  birthMonth: string,
  birthYear: string,
  dbValue: string,
): boolean {
  if (!dbValue) return false
  const db = normalizeValue(dbValue)

  const monthIdx = parseInt(birthMonth, 10)
  const monthName = !isNaN(monthIdx) ? MONTH_NAMES[monthIdx] : normalizeValue(birthMonth)
  const year = birthYear.trim()

  // Exact format match: "march 1982" === "march 1982"
  if (monthName && year) {
    if (db === `${monthName} ${year}`) return true
  }
  if (year && !monthName) {
    if (db === year) return true
  }

  // DB has more precision (e.g. "march 23, 1982") — import has month+year only.
  // If year matches and month matches, treat as match (DB is more precise, don't overwrite).
  if (year && db.includes(year)) {
    if (monthName && db.startsWith(monthName)) return true
    if (!monthName) return true
  }

  return false
}

/** Reconstruct the bio the executor would produce from source fields. */
function composeBio(fields: Record<string, string>): string {
  const parts: string[] = []
  if (fields.biography) parts.push(fields.biography)
  if (fields.biographies) parts.push(fields.biographies)
  if (fields.tattoos) parts.push(`Tattoos: ${fields.tattoos}`)
  if (fields.activities) parts.push(`Activities: ${fields.activities}`)
  return parts.join('\n\n')
}

/** Check if the composed bio matches the current DB bio. */
function bioMatches(fields: Record<string, string>, dbBio: string | null): boolean {
  if (!dbBio) return false
  return normalizeValue(composeBio(fields)) === normalizeValue(dbBio)
}

function getChangeType(
  row: ComparisonRow & { kind: 'field' },
  fields: Record<string, string>,
  currentValue: string | null,
  isNewEntity: boolean,
): ChangeType {
  const sourceKey = row.source?.key ?? row.sourceRef ?? null

  // No source maps to this target
  if (!sourceKey) return 'none'

  // Bio-related rows: compare composed bio against DB bio
  const isBioRow = sourceKey === 'biography' || sourceKey === 'biographies' || sourceKey === 'tattoos' || sourceKey === 'activities'

  // Check if source has a value
  let sourceHasValue = false
  let sourceValue = ''

  if (sourceKey === 'birthMonth+birthYear') {
    sourceHasValue = !!(fields.birthMonth || fields.birthYear)
    sourceValue = `${fields.birthMonth ?? ''} ${fields.birthYear ?? ''}`.trim()
  } else {
    sourceValue = fields[sourceKey] ?? ''
    sourceHasValue = !!sourceValue
  }

  if (!sourceHasValue) return 'none'

  if (isNewEntity) return 'set'

  // Bio: check if the full composed bio matches DB bio
  if (isBioRow && currentValue !== undefined) {
    // For append rows (tattoos/activities), check full bio match
    if (row.changeMode === 'append') {
      return bioMatches(fields, currentValue) ? 'match' : 'append'
    }
    // For biography (overwrite), also check full bio match
    if (sourceKey === 'biography') {
      if (bioMatches(fields, currentValue)) return 'match'
      return currentValue ? 'overwrite' : 'set'
    }
  }

  // For append rows (non-bio), just show append if source has content
  if (row.changeMode === 'append') {
    return sourceHasValue ? 'append' : 'none'
  }

  if (!currentValue) return 'set'

  // Match detection
  if (sourceKey === 'birthMonth+birthYear') {
    if (birthdateMatches(fields.birthMonth ?? '', fields.birthYear ?? '', currentValue)) {
      return 'match'
    }
  } else if (valuesMatch(sourceValue, currentValue, row.target.key)) {
    return 'match'
  }

  return 'overwrite'
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const CHANGE_STYLES: Record<ChangeType, string> = {
  match: 'border-l-2 border-l-green-500/30 bg-green-500/5 opacity-60',
  overwrite: 'border-l-2 border-l-amber-500 bg-amber-500/5',
  set: 'border-l-2 border-l-emerald-500 bg-emerald-500/5',
  append: 'border-l-2 border-l-blue-500 bg-blue-500/5',
  none: '',
}

const CHANGE_ICONS: Record<ChangeType, React.ReactNode> = {
  match: <Check size={10} className="text-green-500" />,
  overwrite: <Pencil size={10} className="text-amber-500" />,
  set: <Plus size={10} className="text-emerald-500" />,
  append: <Plus size={10} className="text-blue-500" />,
  none: null,
}

const CHANGE_LABELS: Record<ChangeType, string> = {
  match: 'matches',
  overwrite: 'overwrites',
  set: 'will set',
  append: 'appends',
  none: '',
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ComparisonSourceCell({
  sourceKey,
  label,
  fields,
  originalData,
  isActionable,
  isSaving,
  onChange,
  onClear,
  onRestore,
}: {
  sourceKey: string
  label: string
  fields: Record<string, string>
  originalData: Record<string, unknown>
  isActionable: boolean
  isSaving: boolean
  onChange: (key: string, value: string) => void
  onClear: (key: string) => void
  onRestore: (key: string) => void
}) {
  const isComposite = sourceKey === 'birthMonth+birthYear'

  if (!isActionable) {
    // Read-only display
    const displayValue = isComposite
      ? [fields.birthMonth, fields.birthYear].filter(Boolean).join(' / ')
      : fields[sourceKey] ?? ''
    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-sm">{displayValue || <span className="italic text-muted-foreground/40">(empty)</span>}</span>
      </div>
    )
  }

  if (isComposite) {
    const monthVal = fields.birthMonth ?? ''
    const yearVal = fields.birthYear ?? ''
    const monthOrig = String(originalData.birthMonth ?? '')
    const yearOrig = String(originalData.birthYear ?? '')
    const isCleared = !monthVal && !yearVal
    const isModified = monthVal !== monthOrig || yearVal !== yearOrig

    return (
      <div className="flex items-center gap-2 py-1.5">
        <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Input
            value={monthVal}
            onChange={(e) => onChange('birthMonth', e.target.value)}
            disabled={isSaving}
            placeholder="Month"
            className={cn(
              'h-7 w-20 text-sm',
              isCleared && 'border-dashed border-muted-foreground/30 italic text-muted-foreground',
            )}
          />
          <Input
            value={yearVal}
            onChange={(e) => onChange('birthYear', e.target.value)}
            disabled={isSaving}
            placeholder="Year"
            className={cn(
              'h-7 w-20 text-sm',
              isCleared && 'border-dashed border-muted-foreground/30 italic text-muted-foreground',
            )}
          />
          {!isCleared ? (
            <button
              type="button"
              onClick={() => { onClear('birthMonth'); onClear('birthYear') }}
              disabled={isSaving}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Skip this field"
            >
              <X size={12} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { onRestore('birthMonth'); onRestore('birthYear') }}
              disabled={isSaving}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              title="Restore original value"
            >
              <RotateCcw size={12} />
            </button>
          )}
          {isModified && !isCleared && (
            <button
              type="button"
              onClick={() => { onRestore('birthMonth'); onRestore('birthYear') }}
              disabled={isSaving}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
              title="Restore original value"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>
    )
  }

  // Standard single-field input
  const value = fields[sourceKey] ?? ''
  const originalStr = String(originalData[sourceKey] ?? '')
  const isCleared = value === ''
  const isModified = value !== originalStr

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => onChange(sourceKey, e.target.value)}
          disabled={isSaving}
          className={cn(
            'h-7 text-sm',
            isCleared && 'border-dashed border-muted-foreground/30 text-muted-foreground italic',
            isModified && !isCleared && 'border-amber-500/50',
          )}
          placeholder={isCleared ? '(skipped)' : undefined}
        />
        {!isCleared ? (
          <button
            type="button"
            onClick={() => onClear(sourceKey)}
            disabled={isSaving}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Skip this field"
          >
            <X size={12} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onRestore(sourceKey)}
            disabled={isSaving}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            title="Restore original value"
          >
            <RotateCcw size={12} />
          </button>
        )}
        {isModified && !isCleared && (
          <button
            type="button"
            onClick={() => onRestore(sourceKey)}
            disabled={isSaving}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            title="Restore original value"
          >
            <RotateCcw size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

function ComparisonTargetCell({
  label,
  currentValue,
  changeType,
  isAppendRow,
  previewValue,
  statusPill,
}: {
  label: string
  currentValue: string | null
  changeType: ChangeType
  isAppendRow?: boolean
  previewValue?: string | null
  // Folded AttributeStatus for status-bearing rows (Natural/Enhanced/
  // Restored). Rendered as a small pill next to the value.
  statusPill?: string | null
}) {
  // Append rows: don't show the full bio value, just the label + indicator
  const displayValue = isAppendRow ? null : currentValue
  const showPreview = !displayValue && previewValue

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded px-2 py-1.5',
        CHANGE_STYLES[changeType],
      )}
    >
      <span className="w-36 shrink-0 text-xs font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 truncate text-sm',
          !displayValue && !showPreview && 'italic text-muted-foreground/40',
        )}
      >
        {showPreview ? (
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
            {previewValue}
          </span>
        ) : displayValue
          ? label === 'Bio'
            ? displayValue.length > 80
              ? displayValue.slice(0, 80) + '…'
              : displayValue
            : displayValue
          : isAppendRow ? '' : '—'}
        {statusPill && (
          <span
            className={cn(
              'shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
              statusPill === 'Natural'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : statusPill === 'Enhanced'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
            )}
          >
            {statusPill}
          </span>
        )}
      </span>
      {changeType !== 'none' && (
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
          {CHANGE_ICONS[changeType]}
          {CHANGE_LABELS[changeType]}
        </span>
      )}
    </div>
  )
}

// ADR-0008: read-only annotation row underneath an attribute decision row.
// No source-edit input, no change indicator — just label + source/db values
// side-by-side for context (e.g. the verbatim breast description string).
function AnnotationRow({
  sourceLabel,
  sourceValue,
  targetLabel,
  targetValue,
}: {
  sourceLabel: string
  sourceValue: string
  targetLabel: string
  targetValue: string | null
}) {
  if (!sourceValue && !targetValue) return null
  return (
    <div className="col-span-2 grid grid-cols-2 gap-x-6">
      <div className="flex items-center gap-2 py-1.5 pl-4">
        <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground/70">
          {sourceLabel}
        </span>
        <span className="truncate text-xs italic text-muted-foreground">
          {sourceValue || <span className="text-muted-foreground/40">(empty)</span>}
        </span>
      </div>
      <div className="flex items-center gap-3 rounded px-2 py-1.5">
        <span className="w-36 shrink-0 text-[11px] font-medium text-muted-foreground/70">
          {targetLabel}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs italic text-muted-foreground">
          {targetValue || <span className="text-muted-foreground/40">—</span>}
        </span>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PersonComparisonGrid({
  matchedEntityId,
  fields,
  originalData,
  isActionable,
  isSaving,
  onChange,
  onClear,
  onRestore,
}: PersonComparisonGridProps) {
  const [data, setData] = useState<PersonCurrentData | null | undefined>(
    matchedEntityId ? undefined : null,
  )
  const isNewEntity = !matchedEntityId
  const loading = data === undefined

  useEffect(() => {
    if (!matchedEntityId) return
    let cancelled = false
    fetch(`/api/import/person-current/${matchedEntityId}`)
      .then((res) => res.json())
      .then((result: PersonCurrentData) => {
        if (!cancelled) setData(result.person ? result : null)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [matchedEntityId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading current data…
      </div>
    )
  }

  return (
    <div>
      {/* Entity status banner */}
      {isNewEntity ? (
        <div className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
            <Plus size={14} />
            New person — no existing record. All fields will be created.
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-border/50 bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle size={14} />
            Existing person — review changes before importing.
          </div>
        </div>
      )}

      {/* Column headers */}
      <div className="mb-2 grid grid-cols-2 gap-x-6">
        <div className="text-xs font-medium text-muted-foreground">
          Source Import Data
          <span className="ml-1.5 text-[10px] text-muted-foreground/60">(editable)</span>
        </div>
        <div className="text-xs font-medium text-muted-foreground">
          Current Database State
          <span className="ml-1.5 text-[10px] text-muted-foreground/60">(read-only)</span>
        </div>
      </div>

      {/* Comparison grid */}
      <div className="grid grid-cols-2 gap-x-6">
        {COMPARISON_ROWS.map((row, idx) => {
          if (row.kind === 'section') {
            return (
              <h3
                key={row.section}
                className="col-span-2 mt-4 mb-1 border-b border-border/30 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {row.section}
              </h3>
            )
          }

          if (row.kind === 'annotation') {
            const srcVal = fields[row.source.key] ?? ''
            const tgtVal = data ? row.target.getValue(data) : null
            return (
              <AnnotationRow
                key={`annotation-${row.source.key}-${idx}`}
                sourceLabel={row.source.label}
                sourceValue={srcVal}
                targetLabel={row.target.label}
                targetValue={tgtVal}
              />
            )
          }

          const currentValue = data ? row.target.getValue(data) : null
          const changeType = getChangeType(row, fields, currentValue, isNewEntity)
          const sourceKey = row.source?.key ?? row.sourceRef ?? null
          // For new entities, show what will be written: explicit getPreview, or fall back to the source value
          let previewValue: string | null = null
          if (isNewEntity) {
            if (row.getPreview) {
              previewValue = row.getPreview(fields)
            } else if (sourceKey === 'birthMonth+birthYear') {
              const parts = [fields.birthMonth, fields.birthYear].filter(Boolean)
              previewValue = parts.length > 0 ? parts.join(' ') : null
            } else if (sourceKey && fields[sourceKey]) {
              previewValue = fields[sourceKey]
            }
          }

          // Row visibility: hide if no source value AND no target value AND no preview AND not a continuation row
          if (!row.source && !row.sourceRef && !currentValue && !previewValue) return null
          if (row.source && !fields[row.source.key] && !currentValue) {
            // Has source definition but source is empty and target is empty — hide
            if (row.source.key === 'birthMonth+birthYear') {
              if (!fields.birthMonth && !fields.birthYear && !currentValue) return null
            } else {
              return null
            }
          }

          const statusPill = data && row.target.getStatusPill ? row.target.getStatusPill(data) : null
          const rowKey = `${row.target.key}-${sourceKey ?? 'none'}`

          return (
            <div key={rowKey} className="col-span-2 grid grid-cols-2 gap-x-6">
              {/* Left cell: source */}
              <div>
                {row.source ? (
                  <ComparisonSourceCell
                    sourceKey={row.source.key}
                    label={row.source.label}
                    fields={fields}
                    originalData={originalData}
                    isActionable={isActionable}
                    isSaving={isSaving}
                    onChange={onChange}
                    onClear={onClear}
                    onRestore={onRestore}
                  />
                ) : (
                  <div className="py-1.5" />
                )}
              </div>

              {/* Right cell: target */}
              <ComparisonTargetCell
                label={row.target.label}
                currentValue={currentValue}
                changeType={changeType}
                isAppendRow={row.changeMode === 'append'}
                previewValue={previewValue}
                statusPill={statusPill}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
