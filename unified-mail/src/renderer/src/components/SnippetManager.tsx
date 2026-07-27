import { useEffect, useState } from 'react'
import type { Snippet } from '../../../shared/types'

interface Props {
  onClose: () => void
}

function blank(): Snippet {
  return {
    id: crypto.randomUUID(),
    name: '',
    keyword: '',
    bodyHtml: '',
    updatedAt: Date.now()
  }
}

export default function SnippetManager({ onClose }: Props): JSX.Element {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [editing, setEditing] = useState<Snippet>(blank())

  const refresh = async (): Promise<void> => {
    setSnippets(await window.api.snippets.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  const save = async (): Promise<void> => {
    if (!editing.name.trim()) return
    await window.api.snippets.save(editing)
    setEditing(blank())
    await refresh()
  }

  const remove = async (id: string): Promise<void> => {
    await window.api.snippets.remove(id)
    await refresh()
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="snip" onMouseDown={(e) => e.stopPropagation()}>
        <div className="snip-head">
          <span>Snippets</span>
          <span className="spacer" />
          <button className="link-btn" onClick={onClose}>
            close
          </button>
        </div>

        <div className="snip-body">
          <div className="snip-list">
            {snippets.length === 0 && (
              <div className="faint" style={{ padding: 12, fontSize: 12 }}>
                no snippets yet
              </div>
            )}
            {snippets.map((s) => (
              <div className="snip-item" key={s.id}>
                <div>
                  <div className="snip-name">{s.name}</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    /{s.keyword}
                  </div>
                </div>
                <span className="spacer" />
                <button className="link-btn" onClick={() => setEditing(s)}>
                  edit
                </button>
                <button className="link-btn" onClick={() => remove(s.id)}>
                  del
                </button>
              </div>
            ))}
          </div>

          <div className="snip-form">
            <label>NAME</label>
            <input
              value={editing.name}
              onChange={(e) =>
                setEditing({ ...editing, name: e.target.value })
              }
              placeholder="e.g. Meeting follow-up"
            />
            <label>KEYWORD (slash trigger)</label>
            <input
              value={editing.keyword}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  keyword: e.target.value.replace(/\s+/g, '')
                })
              }
              placeholder="e.g. followup"
            />
            <label>BODY</label>
            <textarea
              value={editing.bodyHtml}
              onChange={(e) =>
                setEditing({ ...editing, bodyHtml: e.target.value })
              }
              placeholder="Text or simple HTML inserted at the cursor"
              rows={6}
            />
            <div className="snip-form-actions">
              <button className="btn" onClick={save}>
                Save
              </button>
              <button
                className="btn ghost"
                onClick={() => setEditing(blank())}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
