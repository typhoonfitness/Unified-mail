import { useEffect, useState } from 'react'
import type { WeatherNow } from '../../../../shared/types'
import Card, { type CardStatus } from './Card'

function glyph(code: number): string {
  if (code === 0) return '☀'
  if (code <= 2) return '⛅'
  if (code === 3) return '☁'
  if (code >= 45 && code <= 48) return '🌫'
  if (code >= 51 && code <= 67) return '🌧'
  if (code >= 71 && code <= 86) return '❄'
  if (code >= 95) return '⛈'
  return '·'
}

export default function WeatherCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [wx, setWx] = useState<WeatherNow | null>(null)
  const [status, setStatus] = useState<CardStatus>('busy')
  const [hourly, setHourly] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      setStatus('busy')
      const w = await window.api.dashboard.weather()
      if (!alive) return
      setWx(w)
      setStatus(w ? 'ok' : 'err')
    }
    void load()
    const t = setInterval(load, 15 * 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  return (
    <Card
      title={`Weather · ${wx?.place ?? '—'}`}
      status={status}
      actions={
        <>
          <button className="hd-act" onClick={() => setHourly((v) => !v)}>
            {hourly ? 'daily' : 'hourly'}
          </button>
          <button className="hd-act" onClick={onSettings}>
            set
          </button>
        </>
      }
    >
      {!wx ? (
        <div className="faint dash-empty">no weather</div>
      ) : (
        <>
          <div className="wx-main">
            <span className="wx-glyph">{glyph(wx.code)}</span>
            <span className="wx-temp">{wx.tempF}°</span>
            <div className="wx-meta">
              <div>{wx.description}</div>
              <div className="faint">
                H {wx.high}° · L {wx.low}° · wind {wx.windKph}kph
              </div>
            </div>
          </div>
          {hourly ? (
            <div className="wx-hours">
              {wx.hourly.map((h, i) => (
                <div className="wx-hour" key={i}>
                  <span className="faint">{h.hour}</span>
                  <span>{glyph(h.code)}</span>
                  <span>{h.temp}°</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="wx-days">
              {wx.daily.slice(1, 5).map((d) => (
                <div className="wx-day" key={d.day}>
                  <div className="faint">{d.day}</div>
                  <div>{glyph(d.code)}</div>
                  <div>
                    {d.high}°<span className="faint"> {d.low}°</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
