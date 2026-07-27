import { useEffect, useRef, useState } from 'react'
import type { Address } from '../../../shared/types'

interface Props {
  value: string
  placeholder?: string
  onChange: (v: string) => void
}

// A comma-separated recipients field with contact autocomplete on the current
// token (matched against people you've received mail from).
export default function RecipientInput({
  value,
  placeholder,
  onChange
}: Props): JSX.Element {
  const [suggestions, setSuggestions] = useState<Address[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentToken = (): string => value.split(',').pop()?.trim() ?? ''

  useEffect(() => {
    const token = currentToken()
    if (timer.current) clearTimeout(timer.current)
    if (token.length < 2) {
      setSuggestions([])
      setOpen(false)
      return
    }
    timer.current = setTimeout(async () => {
      const list = await window.api.mail.searchContacts(token)
      setSuggestions(list)
      setOpen(list.length > 0)
      setActive(0)
    }, 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const pick = (a: Address): void => {
    const parts = value.split(',')
    parts.pop()
    const formatted = a.name ? `${a.name} <${a.email}>` : a.email
    const next = [...parts.map((p) => p.trim()).filter(Boolean), formatted].join(
      ', '
    )
    onChange(next + ', ')
    setOpen(false)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[active]) {
        e.preventDefault()
        pick(suggestions[active])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="rcpt-wrap">
      <input
        ref={inputRef}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="rcpt-menu">
          {suggestions.map((s, i) => (
            <button
              key={s.email}
              className={`rcpt-opt ${i === active ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
            >
              <span className="rcpt-name">{s.name || s.email}</span>
              {s.name && <span className="faint rcpt-email">{s.email}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
