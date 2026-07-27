import { useEffect, useMemo, useState } from 'react'
import type { NewsItem } from '../../../../shared/types'
import Card, { type CardStatus } from './Card'

function ago(ms: number | null): string {
  if (!ms) return ''
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

function sourceLabel(s: string): string {
  return s
    .replace(/^https?:\/\/(www\.)?/, '')
    .split('/')[0]
    .replace(/\.(com|org|net|xml|io|co\.uk)$/i, '')
    .slice(0, 22)
    .toUpperCase()
}

export default function NewsCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [items, setItems] = useState<NewsItem[]>([])
  const [status, setStatus] = useState<CardStatus>('busy')
  const [cat, setCat] = useState('All')

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const n = await window.api.dashboard.news()
      if (!alive) return
      setItems(n)
      setStatus(n.length ? 'ok' : 'err')
    }
    void load()
    const t = setInterval(load, 10 * 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const tabs = useMemo(() => {
    const set = new Set<string>()
    for (const i of items) if (i.topic) set.add(i.topic)
    return ['All', ...Array.from(set)]
  }, [items])

  const filtered = useMemo(
    () => (cat === 'All' ? items : items.filter((i) => i.topic === cat)),
    [items, cat]
  )

  return (
    <Card
      title="News Feed"
      status={status}
      actions={
        <button className="hd-act" onClick={onSettings}>
          topics
        </button>
      }
    >
      {tabs.length > 1 && (
        <div className="news-tabs">
          {tabs.map((t) => (
            <button
              key={t}
              className={`news-tab ${cat === t ? 'on' : ''}`}
              onClick={() => setCat(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="faint dash-empty">no headlines</div>
      ) : (
        <div className="ni-list">
          {filtered.map((n, i) => (
            <button
              className="ni"
              key={i}
              onClick={() => n.link && window.open(n.link, '_blank')}
            >
              <div className="ni-t">{n.title}</div>
              <div className="ni-m">
                {sourceLabel(n.source)} · {ago(n.published)}
                <span className="ni-ext">OPEN ↗</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
