import { useEffect, useState } from 'react'
import type { AppSettings, Quote } from '../../../../shared/types'
import Card, { type CardStatus } from './Card'
import { brokerUrl } from '../../lib/broker'

export default function MarketsCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [status, setStatus] = useState<CardStatus>('busy')
  const [broker, setBroker] = useState<AppSettings['broker']>('none')

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const q = await window.api.dashboard.quotes()
      if (!alive) return
      setQuotes(q)
      setStatus(q.length ? 'ok' : 'err')
    }
    void load()
    void window.api.settings.get().then((s) => setBroker(s.broker))
    const unsub = window.events.onSettingsChanged((s) => setBroker(s.broker))
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
      unsub()
    }
  }, [])

  return (
    <Card
      title="Markets"
      status={status}
      actions={
        <button className="hd-act" onClick={onSettings}>
          edit
        </button>
      }
    >
      {quotes.length === 0 ? (
        <div className="faint dash-empty">no symbols</div>
      ) : (
        <div className="mkt-list">
          {quotes.map((q) => {
            const up = q.changePct >= 0
            const link = brokerUrl(broker, q.symbol)
            return (
              <div className="mkt-row" key={q.symbol}>
                {link ? (
                  <button
                    className="mkt-sym mkt-link"
                    onClick={() => window.open(link, '_blank')}
                    title="open at broker"
                  >
                    {q.symbol}
                  </button>
                ) : (
                  <span className="mkt-sym">{q.symbol}</span>
                )}
                <span className="mkt-price">
                  {Number.isNaN(q.price) ? '—' : q.price.toLocaleString()}
                </span>
                <span className={up ? 'up' : 'down'}>
                  {Number.isNaN(q.price)
                    ? ''
                    : `${up ? '▲' : '▼'} ${Math.abs(q.changePct).toFixed(2)}%`}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
