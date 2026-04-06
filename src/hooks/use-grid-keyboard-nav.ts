import { useCallback, useEffect, useRef, useState } from 'react'

type KeyAction = {
  key: string
  action: () => void
}

type UseGridKeyboardNavOptions = {
  /** Flat list of item IDs in display order */
  itemIds: string[]
  /** Ref to the grid container (for detecting column count) */
  gridRef: React.RefObject<HTMLDivElement | null>
  /** Callback when focus moves to an item */
  onFocusChange: (id: string | null) => void
  /** Whether keyboard navigation is enabled */
  enabled: boolean
  /** Extra single-key actions (e.g., A=approve, S=skip) */
  actions?: KeyAction[]
  /** Callback when Escape is pressed */
  onEscape?: () => void
  /** Callback when Enter/E is pressed on focused item */
  onOpen?: (id: string) => void
  /** Callback when Space is pressed (toggle checkbox) */
  onToggle?: (id: string) => void
  /** Callback to scroll a virtual list item into view */
  onScrollToIndex?: (index: number) => void
}

export function useGridKeyboardNav({
  itemIds,
  onFocusChange,
  enabled,
  actions,
  onEscape,
  onOpen,
  onToggle,
  onScrollToIndex,
}: UseGridKeyboardNavOptions) {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const focusedIndexRef = useRef(focusedIndex)

  // Keep ref in sync via effect (not during render)
  useEffect(() => {
    focusedIndexRef.current = focusedIndex
  }, [focusedIndex])

  // Derive focused ID
  const focusedId = focusedIndex >= 0 && focusedIndex < itemIds.length
    ? itemIds[focusedIndex]
    : null

  // Notify parent of focus changes
  useEffect(() => {
    onFocusChange(focusedId)
  }, [focusedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll focused item into view (for virtualized lists)
  useEffect(() => {
    if (focusedIndex >= 0 && onScrollToIndex) {
      onScrollToIndex(focusedIndex)
    }
  }, [focusedIndex, onScrollToIndex])

  const getColumnsPerRow = useCallback((): number => {
    return 1
  }, [])

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }

      const idx = focusedIndexRef.current
      const total = itemIds.length

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault()
          const next = idx < 0 ? 0 : Math.min(idx + 1, total - 1)
          setFocusedIndex(next)
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const next = idx < 0 ? 0 : Math.max(idx - 1, 0)
          setFocusedIndex(next)
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          const cols = getColumnsPerRow()
          const next = idx < 0 ? 0 : Math.min(idx + cols, total - 1)
          setFocusedIndex(next)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const cols = getColumnsPerRow()
          const next = idx < 0 ? 0 : Math.max(idx - cols, 0)
          setFocusedIndex(next)
          break
        }
        case 'Escape': {
          if (onEscape) {
            e.preventDefault()
            onEscape()
          }
          break
        }
        case 'Enter':
        case 'e':
        case 'E': {
          if (focusedId && onOpen) {
            e.preventDefault()
            onOpen(focusedId)
          }
          break
        }
        case ' ': {
          if (focusedId && onToggle) {
            e.preventDefault()
            onToggle(focusedId)
          }
          break
        }
        default: {
          // Check custom actions
          if (focusedId && actions) {
            const match = actions.find((a) => a.key.toLowerCase() === e.key.toLowerCase())
            if (match) {
              e.preventDefault()
              match.action()
            }
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, itemIds, focusedId, actions, onEscape, onOpen, onToggle, getColumnsPerRow])

  return {
    focusedId,
    focusedIndex,
    setFocusedIndex,
  }
}
