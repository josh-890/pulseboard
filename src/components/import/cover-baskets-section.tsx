'use client'

import { useEffect, useRef, useState } from 'react'
import { User, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CoverBasketsTab } from '@/components/staging-sets/cover-baskets-tab'

type PersonResult = { id: string; displayName: string; icgId: string; matchedAlias?: string | null }

type CoverBasketsSectionProps = {
  initialPersonId?: string
  initialPersonLabel?: string
}

export function CoverBasketsSection({ initialPersonId, initialPersonLabel }: CoverBasketsSectionProps) {
  const [personId, setPersonId] = useState(initialPersonId ?? '')
  const [personLabel, setPersonLabel] = useState(initialPersonLabel ?? '')
  const [personSearch, setPersonSearch] = useState('')
  const [personSuggestions, setPersonSuggestions] = useState<PersonResult[]>([])
  const [personDropdownOpen, setPersonDropdownOpen] = useState(false)
  const personDebounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const personContainerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (personContainerRef.current && !personContainerRef.current.contains(e.target as Node)) {
        setPersonDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [])

  // Debounce person search — 200ms. The "clear on empty query" reset
  // here is the canonical debounced-search idiom; suppress the synchronous
  // setState lint flag because the source (`personSearch`) is a user-typed
  // input and the reset is the correct event-driven response.
  useEffect(() => {
    clearTimeout(personDebounceRef.current)
    if (!personSearch.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPersonSuggestions([])
      setPersonDropdownOpen(false)
      return
    }
    personDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/people/search?q=${encodeURIComponent(personSearch)}`)
        if (res.ok) {
          const data = (await res.json()) as PersonResult[]
          setPersonSuggestions(data)
          setPersonDropdownOpen(data.length > 0)
        }
      } catch {
        // ignore
      }
    }, 200)
    return () => clearTimeout(personDebounceRef.current)
  }, [personSearch])

  const handleSelect = (person: PersonResult) => {
    setPersonId(person.id)
    setPersonLabel(person.displayName)
    setPersonSearch('')
    setPersonSuggestions([])
    setPersonDropdownOpen(false)
  }

  const handleClear = () => {
    setPersonId('')
    setPersonLabel('')
    setPersonSearch('')
    setPersonSuggestions([])
    setPersonDropdownOpen(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Person selector */}
      <div ref={personContainerRef} className="relative w-72">
        <User size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search for a person..."
          value={personId ? personLabel : personSearch}
          readOnly={!!personId}
          onChange={(e) => { if (!personId) setPersonSearch(e.target.value) }}
          onFocus={() => { if (!personId && personSuggestions.length > 0) setPersonDropdownOpen(true) }}
          className="h-9 pl-8 pr-7 text-sm"
        />
        {(personSearch || personId) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 transition-colors hover:text-foreground"
          >
            <X size={13} />
          </button>
        )}
        {personDropdownOpen && personSuggestions.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover shadow-md">
            {personSuggestions.map((person) => (
              <button
                key={person.id}
                onMouseDown={(e) => { e.preventDefault(); handleSelect(person) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <span className="font-medium">
                  {person.displayName}
                  {person.matchedAlias && (
                    <span className="font-normal text-muted-foreground"> (a.k.a.: {person.matchedAlias})</span>
                  )}
                </span>
                <span className="text-muted-foreground">#{person.icgId}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Basket panels — CoverBasketsTab handles empty state when personId is undefined */}
      <div className="flex min-h-0 flex-1 flex-col">
        <CoverBasketsTab personId={personId || undefined} />
      </div>
    </div>
  )
}
