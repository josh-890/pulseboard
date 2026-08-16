'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PersonIdentity } from '@/components/shared/person-identity'
import { searchAssignablePeopleAction } from '@/lib/actions/attribution-actions'

export type AssignablePerson = {
  icgId: string
  name: string
  kind: 'person' | 'contact'
  avatarUrl: string | null
  personId: string | null
}

type PersonAssignPickerProps = {
  open: boolean
  /** What the assignment will apply to, shown so the target is never ambiguous. */
  targetLabel: string
  /**
   * `keepOpen` means "this set has more people": the caller adds the person and
   * leaves the folder open instead of closing it and moving on. Held Shift, or
   * Shift+Enter on the keyboard — the same gesture as Shift+digit on a candidate.
   */
  onAssign: (person: AssignablePerson, opts: { keepOpen: boolean }) => void
  onClose: () => void
}

/**
 * Assign someone the matcher never proposed.
 *
 * This is the gap Immich's users report most: a suggestion list is not an
 * identity list, and sooner or later the right person is simply not among the
 * proposals. Without this the operator's only options are to reject the folder or
 * to leave the workbench.
 *
 * Searches curated Persons **and** Contacts, because 98 % of what this workbench
 * touches are Contacts. Every row carries `Name (ICG-ID)` and a face where one is
 * known — a bare name is not an identity. There is deliberately no "create
 * person": an ICG-ID must come from a real record, and a flow built for speed is
 * the wrong place to mint one.
 */
export function PersonAssignPicker({ open, targetLabel, onAssign, onClose }: PersonAssignPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AssignablePerson[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)

  // Debounced search, driven by typing rather than an effect on `open`, so the
  // React Compiler's no-setState-in-effect rule is respected.
  const runSearch = useCallback((q: string) => {
    setQuery(q)
    setCursor(0)
    const seq = ++seqRef.current
    if (q.trim().length < 2) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    window.setTimeout(async () => {
      if (seq !== seqRef.current) return
      const res = await searchAssignablePeopleAction(q)
      // A stale response must never overwrite a newer one — the guard is the
      // sequence number, not the arrival order.
      if (seq !== seqRef.current) return
      setLoading(false)
      setResults(res.success ? res.data : [])
    }, 200)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  if (!open) return null

  const choose = (p: AssignablePerson | undefined, keepOpen = false) => {
    if (!p) return
    onAssign(p, { keepOpen })
    setQuery('')
    setResults([])
    if (keepOpen) inputRef.current?.focus()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 p-4 pt-24 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Assign a person"
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            onKeyDown={(e) => {
              // Stop every key here: the grid behind this overlay binds single
              // letters to destructive verbs, and typing a name must not confirm
              // a folder.
              e.stopPropagation()
              if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setCursor((c) => Math.min(results.length - 1, c + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setCursor((c) => Math.max(0, c - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(results[cursor], e.shiftKey)
              }
            }}
            placeholder="Name, alias or ICG-ID…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <p className="border-b border-border/60 bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
          Assign to <span className="font-medium text-foreground">{targetLabel}</span>
        </p>

        <ul className="max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {query.trim().length < 2 ? 'Type at least two characters.' : loading ? 'Searching…' : 'Nobody found.'}
            </li>
          ) : (
            results.map((p, i) => (
              <li key={`${p.kind}-${p.icgId}`}>
                <button
                  onClick={(e) => choose(p, e.shiftKey)}
                  onMouseEnter={() => setCursor(i)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150',
                    i === cursor ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- MinIO-signed URL
                    <img src={p.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="h-8 w-8 shrink-0 rounded bg-muted" />
                  )}
                  <PersonIdentity name={p.name} icgId={p.icgId} className="min-w-0 flex-1" />
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-[10px]',
                      i === cursor ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {p.kind}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>

        <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          ↑↓ move · Enter assign · <span className="font-medium">Shift+Enter</span> add and keep the folder open · Esc close
          <br />
          New identities come from a catalogue import, not from here.
        </p>
      </div>
    </div>
  )
}
