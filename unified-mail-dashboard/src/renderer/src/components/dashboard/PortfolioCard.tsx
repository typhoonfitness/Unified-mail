import { useCallback, useEffect, useState } from 'react'
import type { Holding, Quote } from '../../../../shared/types'
import Card, { type CardStatus } from './Card'

export default function PortfolioCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [status, setStatus] = useState<CardStatus>('busy')

  const load = useCallback(async () => {
    const cfg = await window.api.dashboard.getConfig()
    setHoldings(cfg.holdings)
    if (cfg.holdings.length === 0) {
      setStatus('ok')
      return
    }
    const q = await window.api.dashboard.quotesFor(
      cfg.holdings.map((h) => h.symbol)
    )
    const map: Record<string, Quote> = {}
    for (const item of q) map[item.symbol.toUpperCase()] = item
    setQuotes(map)
    setStatus('ok')
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  const rows = holdings.map((h) => {
    const q = quotes[h.symbol.toUpperCase().replace('-USD', 'USD')] ??
      quotes[h.symbol.toUpperCase()]
    const price = q?.price ?? NaN
    const value = Number.isNaN(price) ? 0 : price * h.shares
    const dayPL = q ? q.change * h.shares : 0
    const unreal = h.cost != null && !Number.isNaN(price) ? (price - h.cost) * h.shares : null
    return { h, price, value, dayPL, unreal }
  })

  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  const totalDayPL = rows.reduce((s, r) => s + r.dayPL, 0)

  const fmt = (n: number): string =>
    n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  return (
    <Card
      title="Portfolio"
      status={status}
      actions={
        <button className="hd-act" onClick={onSettings}>
          holdings
        </button>
      }
    >
      {holdings.length === 0 ? (
        <div className="faint dash-empty">add holdings in settings</div>
      ) : (
        <>
          <div className="pf-total">
            <span className="pf-value glow">${fmt(totalValue)}</span>
            <span className={totalDayPL >= 0 ? 'up' : 'down'}>
              {totalDayPL >= 0 ? '▲' : '▼'} ${fmt(Math.abs(totalDayPL))} today
            </span>
          </div>
          <div className="pf-list">
            {rows.map((r) => (
              <div className="pf-row" key={r.h.symbol}>
                <span className="pf-sym">{r.h.symbol.toUpperCase()}</span>
                <span className="faint">{r.h.shares} sh</span>
                <span className="pf-rowval">
                  {Number.isNaN(r.price) ? '—' : `$${fmt(r.value)}`}
                </span>
                <span className={r.dayPL >= 0 ? 'up' : 'down'}>
                  {r.dayPL >= 0 ? '▲' : '▼'}${fmt(Math.abs(r.dayPL))}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
