import { useEffect, useRef, useState } from 'react'
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window'
import type { ThreadSummary } from '../../../shared/types'
import { relativeTime, displayName } from '../lib/format'

interface Props {
  threads: ThreadSummary[]
  selectedId: string | null
  checked: Set<string>
  onSelect: (t: ThreadSummary) => void
  onToggleStar: (t: ThreadSummary) => void
  onToggleCheck: (id: string) => void
}

const ROW_HEIGHT = 66

interface RowData {
  threads: ThreadSummary[]
  selectedId: string | null
  checked: Set<string>
  onSelect: (t: ThreadSummary) => void
  onToggleStar: (t: ThreadSummary) => void
  onToggleCheck: (id: string) => void
}

function Row({ index, style, data }: ListChildComponentProps<RowData>): JSX.Element {
  const t = data.threads[index]
  const unread = t.unreadCount > 0
  const sender = t.participants.length
    ? displayName(t.participants[0])
    : t.subject || '(no sender)'
  const extra = t.participants.length > 1 ? ` +${t.participants.length - 1}` : ''

  return (
    <div style={style}>
      <button
        className={`row ${unread ? 'unread' : 'read'} ${
          data.selectedId === t.id ? 'selected' : ''
        }`}
        style={{ height: ROW_HEIGHT }}
        onClick={() => data.onSelect(t)}
      >
        <div className="r1">
          <span
            className={`row-check ${data.checked.has(t.id) ? 'on' : ''}`}
            role="checkbox"
            aria-checked={data.checked.has(t.id)}
            onClick={(e) => {
              e.stopPropagation()
              data.onToggleCheck(t.id)
            }}
          >
            {data.checked.has(t.id) ? '☑' : '☐'}
          </span>
          <span className="dot" />
          {t.providers.map((p) => (
            <span key={p} className={`badge ${p}`}>
              {p === 'google' ? 'G' : 'O'}
            </span>
          ))}
          <span className="sender">
            {sender}
            <span className="faint">{extra}</span>
          </span>
          {t.messageCount > 1 && <span className="faint">({t.messageCount})</span>}
          <span
            className={`star ${t.hasStarred ? 'on' : ''}`}
            role="button"
            onClick={(e) => {
              e.stopPropagation()
              data.onToggleStar(t)
            }}
          >
            {t.hasStarred ? '★' : '☆'}
          </span>
          <span className="time">{relativeTime(t.lastMessageAt)}</span>
        </div>
        <div className="subject">{t.subject || '(no subject)'}</div>
        <div className="snippet">{t.snippet}</div>
      </button>
    </div>
  )
}

export default function ThreadList({
  threads,
  selectedId,
  checked,
  onSelect,
  onToggleStar,
  onToggleCheck
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(600)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.clientHeight))
    ro.observe(el)
    setHeight(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="list" ref={ref}>
      {threads.length === 0 ? (
        <div
          style={{
            padding: 24,
            color: 'var(--faint)',
            letterSpacing: 2,
            textTransform: 'uppercase',
            fontSize: 12
          }}
        >
          no messages
        </div>
      ) : (
        <List
          height={height}
          width="100%"
          itemCount={threads.length}
          itemSize={ROW_HEIGHT}
          itemData={{
            threads,
            selectedId,
            checked,
            onSelect,
            onToggleStar,
            onToggleCheck
          }}
        >
          {Row}
        </List>
      )}
    </div>
  )
}
