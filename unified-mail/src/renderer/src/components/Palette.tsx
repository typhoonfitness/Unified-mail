import { useEffect, useMemo, useRef, useState } from 'react'

export interface PaletteItem {
  id: string
  label: string
  hint?: string
  run: () => void
}

interface Props {
  title?: string
  placeholder?: string
  items: PaletteItem[]
  onClose: () => void
}

// A generic fuzzy-ish command palette (substring match). Reused for the main
// command palette and the compose snippet picker.
export default function Palette({
  title,
  placeholder,
  items,
  onClose
}: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.hint?.toLowerCase().includes(q) ?? false)
    )
  }, [query, items])

  useEffect(() => {
    setActive(0)
  }, [query])

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[active]
      if (item) {
        item.run()
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <span className="prompt">&gt;</span>
          <input
            ref={inputRef}
            value={query}
            placeholder={placeholder ?? 'Type a command…'}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          {title && <span className="palette-title">{title}</span>}
        </div>
        <div className="palette-list">
          {filtered.length === 0 && (
            <div className="palette-empty">no matches</div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                item.run()
                onClose()
              }}
            >
              <span>{item.label}</span>
              {item.hint && <span className="palette-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
