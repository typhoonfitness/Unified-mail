import { useEffect, useState } from 'react'
import type { Message, MessageFilters } from '../../../shared/types'
import { displayName, fullDate, formatBytes } from '../lib/format'

type Kind = NonNullable<MessageFilters['attachmentKind']>

const KINDS: Array<{ id: Kind; label: string }> = [
  { id: 'any', label: 'All' },
  { id: 'pdf', label: 'PDF' },
  { id: 'image', label: 'Images' },
  { id: 'doc', label: 'Docs' },
  { id: 'sheet', label: 'Sheets' },
  { id: 'archive', label: 'Archives' }
]

interface Props {
  onClose: () => void
  onOpenThread: (threadId: string) => void
}

export default function AttachmentBrowser({
  onClose,
  onOpenThread
}: Props): JSX.Element {
  const [kind, setKind] = useState<Kind>('any')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<Message[] | null>(null)

  useEffect(() => {
    let alive = true
    void window.api.mail
      .listMessages({
        attachmentsOnly: true,
        attachmentKind: kind,
        search: search.trim() || undefined,
        limit: 300
      })
      .then((r) => {
        if (alive) setRows(r)
      })
    return () => {
      alive = false
    }
  }, [kind, search])

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="settings wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>Attachments</span>
          <button className="hd-act" onClick={onClose}>
            close
          </button>
        </div>
        <div className="attach-controls">
          <div className="attach-kinds">
            {KINDS.map((k) => (
              <button
                key={k.id}
                className={`chip-btn ${kind === k.id ? 'active' : ''}`}
                onClick={() => setKind(k.id)}
              >
                {k.label}
              </button>
            ))}
          </div>
          <input
            className="attach-search"
            placeholder="search sender / subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="settings-body">
          {!rows && <div className="faint">loading…</div>}
          {rows && rows.length === 0 && (
            <div className="faint">No matching attachments.</div>
          )}
          {rows && rows.length > 0 && (
            <div className="attach-list">
              {rows.map((m) => (
                <button
                  key={m.id}
                  className="attach-row"
                  onClick={() => {
                    onOpenThread(m.unifiedThreadId)
                    onClose()
                  }}
                >
                  <div className="attach-main">
                    <span className="attach-subj">
                      {m.subject || '(no subject)'}
                    </span>
                    <span className="faint attach-from">
                      {m.from ? displayName(m.from) : '(unknown)'}
                    </span>
                  </div>
                  <div className="attach-files">
                    {m.attachments.slice(0, 4).map((a) => (
                      <span className="chip" key={a.id}>
                        📎 {a.filename}
                        {a.size ? ` · ${formatBytes(a.size)}` : ''}
                      </span>
                    ))}
                    {m.attachments.length > 4 && (
                      <span className="faint">
                        +{m.attachments.length - 4} more
                      </span>
                    )}
                  </div>
                  <div className="faint attach-date">{fullDate(m.receivedAt)}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
