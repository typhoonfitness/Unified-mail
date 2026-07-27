import { useEffect, useState } from 'react'
import type { NewsItem, Quote, SocialPost } from '../../../../shared/types'

// A scrolling marquee of live quotes + news headlines + social posts, like the
// Start Page's top ticker. Data reuses the dashboard proxies.
export default function Ticker(): JSX.Element {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [news, setNews] = useState<NewsItem[]>([])
  const [social, setSocial] = useState<SocialPost[]>([])

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const [q, n, s] = await Promise.all([
        window.api.dashboard.quotes(),
        window.api.dashboard.news(),
        window.api.dashboard.social()
      ])
      if (!alive) return
      setQuotes(q)
      setNews(n.slice(0, 12))
      setSocial(s.slice(0, 12))
    }
    void load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const items: JSX.Element[] = []
  for (const q of quotes) {
    if (Number.isNaN(q.price)) continue
    const up = q.changePct >= 0
    items.push(
      <span className="tick-item" key={`q-${q.symbol}`}>
        <span className="tick-sym">{q.symbol}</span>{' '}
        {q.price.toLocaleString()}{' '}
        <span className={up ? 'up' : 'down'}>
          {up ? '▲' : '▼'}
          {Math.abs(q.changePct).toFixed(2)}%
        </span>
      </span>
    )
  }
  for (const n of news) {
    items.push(
      <span
        className="tick-item tick-news"
        key={`n-${n.link}`}
        onClick={() => n.link && window.open(n.link, '_blank')}
      >
        {n.title}
      </span>
    )
  }
  for (const s of social) {
    items.push(
      <span
        className="tick-item tick-news tick-social"
        key={`s-${s.url}`}
        onClick={() => s.url && window.open(s.url, '_blank')}
      >
        <span className="tick-sym">{s.author}</span> {s.text.slice(0, 120)}
      </span>
    )
  }

  if (items.length === 0) {
    return <div className="ticker" />
  }

  // Duplicate the run so the marquee loops seamlessly.
  return (
    <div className="ticker">
      <div className="ticker-track">
        {items}
        <span className="tick-sep">◆</span>
        {items}
      </div>
    </div>
  )
}
