import { useEffect, useState } from 'react'
import type { AppSettings, QuickLink } from '../../../../shared/types'
import Card from './Card'

function faviconUrl(pageUrl: string): string {
  try {
    const host = new URL(pageUrl).hostname
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
  } catch {
    return ''
  }
}

export default function LinksCard(): JSX.Element {
  const [links, setLinks] = useState<QuickLink[]>([])
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [iconStyle, setIconStyle] =
    useState<AppSettings['linkIconStyle']>('letter')

  useEffect(() => {
    void window.api.dashboard.listLinks().then(setLinks)
    void window.api.settings.get().then((s) => setIconStyle(s.linkIconStyle))
    return window.events.onSettingsChanged((s) => setIconStyle(s.linkIconStyle))
  }, [])

  const add = async (): Promise<void> => {
    if (!title.trim() || !url.trim()) return
    const normUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`
    setLinks(await window.api.dashboard.addLink(title, normUrl))
    setTitle('')
    setUrl('')
  }

  const open = (u: string): void => {
    window.open(u, '_blank')
  }

  return (
    <Card
      title="Quick Links"
      actions={
        <button className="hd-act" onClick={() => setEditing((v) => !v)}>
          {editing ? 'done' : 'edit'}
        </button>
      }
    >
      <div className="links-grid">
        {links.map((l) => (
          <div className="link-tile" key={l.id}>
            <button className="link-open" onClick={() => open(l.url)}>
              <span className="link-fav">
                {iconStyle === 'favicon' && faviconUrl(l.url) ? (
                  <img src={faviconUrl(l.url)} alt="" width={18} height={18} />
                ) : iconStyle === 'minimal' ? (
                  '◆'
                ) : (
                  l.title.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="link-title">{l.title}</span>
            </button>
            {editing && (
              <button
                className="link-del"
                onClick={async () =>
                  setLinks(await window.api.dashboard.removeLink(l.id))
                }
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <div className="link-add">
          <input
            value={title}
            placeholder="name"
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            value={url}
            placeholder="url"
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
          />
          <button className="hd-act" onClick={add}>
            add
          </button>
        </div>
      )}
      {links.length === 0 && !editing && (
        <div className="faint dash-empty">no links — click edit</div>
      )}
    </Card>
  )
}
