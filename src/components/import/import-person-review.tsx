'use client'

// ADR-0009 Phase 1: re-import review UI. Renders the per-row decisions
// stored on ImportItem.decisions for a PERSON item that was matched by
// exact ICG-ID. Each row gets an Accept / Decline button pair; accepted
// scalar attributes gain a 3-way intent picker mirroring the
// record-physical-change-sheet (on-date / dateless / baseline).
//
// Save sends the updated decisions JSON to PATCH the item. The server
// auto-transitions status PENDING_ATTRIBUTE_REVIEW → READY_TO_IMPORT
// when every row is resolved.

import { useState, useCallback } from 'react'
import { Check, X, Save, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  DecisionAction,
  DecisionDestination,
  ImportItemDecisions,
  PersonColumnField,
} from '@/lib/services/import/diff'

const DESTINATION_LABEL: Record<DecisionDestination, string> = {
  'on-date': 'On this date',
  dateless: "I don't know when",
  baseline: 'Always true (baseline)',
}

const PERSON_COLUMN_LABEL: Record<PersonColumnField, string> = {
  birthdate: 'Birthdate',
  nationality: 'Nationality',
  activeFrom: 'Active from',
  retiredAt: 'Retired at',
  bio: 'Biography',
  sexAtBirth: 'Sex at birth',
  birthPlace: 'Birth place',
}

type Props = {
  itemId: string
  batchId: string
  initial: ImportItemDecisions
  onSaved?: () => void
  // ADR-0009: when supplied, the review block can chain Save → Import in a
  // single click once every row is resolved. Without it, the user has to
  // hunt for the small header Import button after the page refreshes.
  onImport?: () => Promise<void>
  isImporting?: boolean
}

export function ImportPersonReview({
  itemId,
  batchId,
  initial,
  onSaved,
  onImport,
  isImporting = false,
}: Props) {
  const [decisions, setDecisions] = useState<ImportItemDecisions>(() => structuredClone(initial))
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setScalarDecision = useCallback((slug: string, action: DecisionAction | null) => {
    setDecisions((prev) => ({
      ...prev,
      scalars: prev.scalars.map((r) =>
        r.slug === slug
          ? {
              ...r,
              decision: action,
              // On Accept, default chosen destination to the row's default
              // unless the user already picked one.
              chosenDestination:
                action === 'accept' ? (r.chosenDestination ?? r.defaultDestination) : null,
            }
          : r,
      ),
    }))
  }, [])

  const setScalarDestination = useCallback((slug: string, dest: DecisionDestination) => {
    setDecisions((prev) => ({
      ...prev,
      scalars: prev.scalars.map((r) =>
        r.slug === slug ? { ...r, chosenDestination: dest } : r,
      ),
    }))
  }, [])

  const setAliasDecision = useCallback((itemKey: string, action: DecisionAction | null) => {
    setDecisions((prev) => ({
      ...prev,
      aliases: prev.aliases.map((r) =>
        r.itemKey === itemKey ? { ...r, decision: action } : r,
      ),
    }))
  }, [])

  const setPersonColumnDecision = useCallback(
    (field: PersonColumnField, action: DecisionAction | null) => {
      setDecisions((prev) => ({
        ...prev,
        personColumns: prev.personColumns.map((r) =>
          r.field === field ? { ...r, decision: action } : r,
        ),
      }))
    },
    [],
  )

  const totalRows =
    decisions.scalars.length + decisions.aliases.length + decisions.personColumns.length
  const decidedRows =
    decisions.scalars.filter((r) => r.decision != null).length +
    decisions.aliases.filter((r) => r.decision != null).length +
    decisions.personColumns.filter((r) => r.decision != null).length
  const allDecided = decidedRows === totalRows

  const persistDecisions = useCallback(async () => {
    const res = await fetch(`/api/import/${batchId}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decisions }),
    })
    if (!res.ok) throw new Error(`Save failed (${res.status})`)
  }, [batchId, itemId, decisions])

  const handleSave = useCallback(async () => {
    setIsSaving(true)
    setError(null)
    try {
      await persistDecisions()
      const totalRowsNow =
        decisions.scalars.length + decisions.aliases.length + decisions.personColumns.length
      const decidedRowsNow =
        decisions.scalars.filter((r) => r.decision != null).length +
        decisions.aliases.filter((r) => r.decision != null).length +
        decisions.personColumns.filter((r) => r.decision != null).length
      if (decidedRowsNow === totalRowsNow) {
        toast.success('Decisions saved — ready to import')
      } else {
        toast.success(`Progress saved (${decidedRowsNow} of ${totalRowsNow} decided)`)
      }
      onSaved?.()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }, [decisions, persistDecisions, onSaved])

  // ADR-0009: one-click commit path. Persists the decisions then triggers
  // the same import endpoint the header button uses. Only valid when every
  // row is resolved.
  const handleSaveAndImport = useCallback(async () => {
    if (!onImport || !allDecided) return
    setIsSaving(true)
    setError(null)
    try {
      await persistDecisions()
      await onImport()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save & import failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }, [onImport, allDecided, persistDecisions])

  return (
    <div className="space-y-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          <div>
            <h3 className="text-sm font-semibold">Re-import review</h3>
            <p className="text-xs text-muted-foreground">
              This person already exists. Decide per-row what to apply.
              {totalRows > 0 && (
                <>
                  {' '}
                  <span className={cn(allDecided && 'text-emerald-500')}>
                    {decidedRows} of {totalRows} decided
                  </span>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allDecided && onImport && (
            <Button
              size="sm"
              onClick={handleSaveAndImport}
              disabled={isSaving || isImporting || totalRows === 0}
            >
              {isSaving || isImporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              Save & Import
            </Button>
          )}
          <Button
            size="sm"
            variant={allDecided && onImport ? 'outline' : 'default'}
            onClick={handleSave}
            disabled={isSaving || isImporting || totalRows === 0}
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            {allDecided && !onImport
              ? 'Save (ready to import)'
              : allDecided
                ? 'Save only'
                : 'Save progress'}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      {totalRows > 0 && (
        <div className="grid grid-cols-12 gap-2 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          <div className="col-span-3">Field</div>
          <div className="col-span-3">Source Import Data</div>
          <div className="col-span-3">Current Database State</div>
          <div className="col-span-3 text-right">Decision</div>
        </div>
      )}

      {decisions.personColumns.length > 0 && (
        <Section title="Person identity fields">
          {decisions.personColumns.map((row) => (
            <DecisionRow
              key={row.field}
              label={PERSON_COLUMN_LABEL[row.field]}
              dbValue={row.dbValue}
              importValue={row.importValue}
              decision={row.decision}
              onAccept={() => setPersonColumnDecision(row.field, 'accept')}
              onDecline={() => setPersonColumnDecision(row.field, 'decline')}
            />
          ))}
        </Section>
      )}

      {decisions.scalars.length > 0 && (
        <Section title="Physical attributes">
          {decisions.scalars.map((row) => (
            <ScalarDecisionRow
              key={row.slug}
              row={row}
              onAccept={() => setScalarDecision(row.slug, 'accept')}
              onDecline={() => setScalarDecision(row.slug, 'decline')}
              onDestination={(d) => setScalarDestination(row.slug, d)}
            />
          ))}
        </Section>
      )}

      {decisions.aliases.length > 0 && (
        <Section title="Aliases">
          {decisions.aliases.map((row) => (
            <DecisionRow
              key={row.itemKey}
              label={row.kind === 'common' ? 'Common alias' : 'Birth alias'}
              dbValue={null}
              importValue={row.importLabel}
              decision={row.decision}
              onAccept={() => setAliasDecision(row.itemKey, 'accept')}
              onDecline={() => setAliasDecision(row.itemKey, 'decline')}
            />
          ))}
        </Section>
      )}

      {totalRows === 0 && (
        <p className="text-xs text-muted-foreground italic">
          No differences detected between the import file and the existing record.
        </p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function DecisionRow({
  label,
  dbValue,
  importValue,
  decision,
  onAccept,
  onDecline,
}: {
  label: string
  dbValue: string | null
  importValue: string
  decision: DecisionAction | null
  onAccept: () => void
  onDecline: () => void
}) {
  // Column convention matches PersonComparisonGrid: Import (source) LEFT,
  // DB (current) RIGHT.
  return (
    <div className="grid grid-cols-12 items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
      <div className="col-span-3 font-medium">{label}</div>
      <div className="col-span-3 whitespace-pre-line break-words text-xs">
        <span className="text-muted-foreground/60">Import:</span>{' '}
        <span className="font-medium">{importValue}</span>
      </div>
      <div className="col-span-3 whitespace-pre-line break-words text-xs text-muted-foreground">
        {dbValue ? (
          <>
            <span className="text-muted-foreground/60">DB:</span> {dbValue}
          </>
        ) : (
          <span className="italic text-muted-foreground/50">(no value)</span>
        )}
      </div>
      <div className="col-span-3 flex justify-end gap-1">
        <DecisionButton selected={decision === 'accept'} onClick={onAccept} kind="accept" />
        <DecisionButton selected={decision === 'decline'} onClick={onDecline} kind="decline" />
      </div>
    </div>
  )
}

function ScalarDecisionRow({
  row,
  onAccept,
  onDecline,
  onDestination,
}: {
  row: ImportItemDecisions['scalars'][number]
  onAccept: () => void
  onDecline: () => void
  onDestination: (d: DecisionDestination) => void
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm">
      <div className="grid grid-cols-12 items-center gap-2">
        <div className="col-span-3 font-medium">
          {row.name}
          {row.dbIsVerifiedUnknown && (
            <span className="ml-1.5 rounded-sm bg-muted/40 px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
              unknown
            </span>
          )}
        </div>
        <div className="col-span-3 whitespace-pre-line break-words text-xs">
          <span className="text-muted-foreground/60">Import:</span>{' '}
          <span className="font-medium">{row.importValue}</span>
        </div>
        <div className="col-span-3 whitespace-pre-line break-words text-xs text-muted-foreground">
          {row.dbIsVerifiedUnknown ? (
            <span className="italic">marked unknown</span>
          ) : row.dbValue ? (
            <>
              <span className="text-muted-foreground/60">DB:</span> {row.dbValue}
            </>
          ) : (
            <span className="italic text-muted-foreground/50">(no value)</span>
          )}
        </div>
        <div className="col-span-3 flex justify-end gap-1">
          <DecisionButton selected={row.decision === 'accept'} onClick={onAccept} kind="accept" />
          <DecisionButton
            selected={row.decision === 'decline'}
            onClick={onDecline}
            kind="decline"
          />
        </div>
      </div>
      {row.decision === 'accept' && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
            file under
          </span>
          {(['on-date', 'dateless', 'baseline'] as const).map((dest) => (
            <button
              key={dest}
              type="button"
              onClick={() => onDestination(dest)}
              className={cn(
                'rounded px-2 py-0.5 text-[11px]',
                row.chosenDestination === dest
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground',
              )}
            >
              {DESTINATION_LABEL[dest]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DecisionButton({
  selected,
  onClick,
  kind,
}: {
  selected: boolean
  onClick: () => void
  kind: 'accept' | 'decline'
}) {
  const Icon = kind === 'accept' ? Check : X
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
        selected
          ? kind === 'accept'
            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
            : 'border-rose-500/40 bg-rose-500/15 text-rose-300'
          : 'border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground',
      )}
    >
      <Icon size={12} />
      {kind === 'accept' ? 'Accept' : 'Decline'}
    </button>
  )
}
