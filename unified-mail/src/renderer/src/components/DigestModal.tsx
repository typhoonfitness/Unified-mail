import { useState } from 'react'
import type { DigestRange } from '../../../shared/types'

const RANGES: Array<{ id: DigestRange; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 days' },
  { id: 'month', label: 'Last 30 days' },
  { id: 'unread', label: 'Unread' }
]

interface Props {
  onClose: () => void
}

export default function DigestModal({ onClose }: Props): JSX.Element {
  const [range, setRange] = useState<DigestRange | null>(null)
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (r: DigestRange): Promise<void> => {
    setRange(r)
    setBusy(true)
    setText(null)
    setError(null)
    const res = await window.api.ai.digest(r)
    setBusy(false)
    if (res.ok) setText(res.text ?? '')
    else setError(res.error ?? 'AI request failed')
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="settings wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>✦ AI digest</span>
          <button className="hd-act" onClick={onClose}>
            close
          </button>
        </div>
        <div className="attach-controls">
          <div className="attach-kinds">
            {RANGES.map((r) => (
              <button
                key={r.id}
                className={`chip-btn ${range === r.id ? 'active' : ''}`}
                onClick={() => void run(r.id)}
                disabled={busy}
              >
                {r.label}
              </button>
            ))}
          </div>
          {text && (
            <button
              className="chip-btn"
              onClick={() => void navigator.clipboard.writeText(text)}
            >
              copy
            </button>
          )}
        </div>
        <div className="settings-body">
          {!range && !busy && (
            <div className="faint">Pick a range to summarize your inbox.</div>
          )}
          {busy && <div className="faint">summarizing…</div>}
          {error && <div className="ai-panel error"><div className="ai-panel-body">{error}</div></div>}
          {text && <div className="digest-body">{text}</div>}
        </div>
      </div>
    </div>
  )
}
