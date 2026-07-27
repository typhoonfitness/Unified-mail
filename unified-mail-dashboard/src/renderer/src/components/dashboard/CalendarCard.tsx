import { useEffect, useMemo, useState } from 'react'
import type { CalendarEvent, Todo } from '../../../../shared/types'
import Card, { type CardStatus } from './Card'

// Ported from the Start Page calendar: month grid with event day-dots + a
// TODAY panel, plus an agenda list view. Click a day to see that day's events.
export default function CalendarCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [status, setStatus] = useState<CardStatus>('busy')
  const [configured, setConfigured] = useState(true)
  const [view, setView] = useState<'month' | 'agenda'>('month')
  const [monthOffset, setMonthOffset] = useState(0)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const cfg = await window.api.dashboard.getConfig()
      if (!alive) return
      setConfigured(Boolean(cfg.icalUrl.trim()))
      const [e, t] = await Promise.all([
        window.api.dashboard.calendar(),
        window.api.dashboard.listTodos()
      ])
      if (!alive) return
      setEvents(e)
      setTodos(t)
      setStatus('ok')
    }
    void load()
    const timer = setInterval(load, 10 * 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const base = useMemo(() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() + monthOffset)
    return d
  }, [monthOffset])

  const y = base.getFullYear()
  const m = base.getMonth()
  const firstDow = new Date(y, m, 1).getDay()
  const daysInMonth = new Date(y, m + 1, 0).getDate()

  const byDay = useMemo(() => {
    const map: Record<number, CalendarEvent[]> = {}
    for (const ev of events) {
      const d = new Date(ev.start)
      if (d.getFullYear() === y && d.getMonth() === m) {
        ;(map[d.getDate()] = map[d.getDate()] || []).push(ev)
      }
    }
    return map
  }, [events, y, m])

  const today = new Date()
  const isThisMonth =
    today.getFullYear() === y && today.getMonth() === m
  const todaysEvents = events.filter((ev) => {
    const d = new Date(ev.start)
    return d.toDateString() === today.toDateString()
  })
  const openTasks = todos.filter((t) => !t.done)

  const dayEvents = selectedDay != null ? (byDay[selectedDay] ?? []) : []

  const timeOf = (ev: CalendarEvent): string =>
    ev.allDay
      ? 'all day'
      : new Date(ev.start).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })

  return (
    <Card
      title="Calendar"
      status={status}
      actions={
        <>
          <button
            className="hd-act"
            onClick={() => setView((v) => (v === 'month' ? 'agenda' : 'month'))}
          >
            {view === 'month' ? 'list' : 'grid'}
          </button>
          <button className="hd-act" onClick={onSettings}>
            setup
          </button>
        </>
      }
    >
      {!configured ? (
        <div className="faint dash-empty">add a calendar iCal URL in settings</div>
      ) : view === 'agenda' ? (
        <div className="cal-list">
          {events.length === 0 && (
            <div className="faint dash-empty">nothing upcoming</div>
          )}
          {events.map((e, i) => (
            <div className="cal-event" key={i}>
              <span className="cal-time">{timeOf(e)}</span>
              <span className="cal-title">
                {new Date(e.start).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric'
                })}{' '}
                · {e.title}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="cal-nav">
            <button onClick={() => setMonthOffset((o) => o - 1)}>‹</button>
            <span>
              {base.toLocaleDateString([], { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => setMonthOffset((o) => o + 1)}>›</button>
          </div>
          <div className="cal-dow">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="cal-cells">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div className="cal-cell empty" key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dn = i + 1
              const has = Boolean(byDay[dn])
              const isToday = isThisMonth && today.getDate() === dn
              return (
                <button
                  key={dn}
                  className={`cal-cell ${has ? 'has' : ''} ${
                    isToday ? 'today' : ''
                  } ${selectedDay === dn ? 'sel' : ''}`}
                  onClick={() => setSelectedDay(dn)}
                >
                  <span className="dn">{dn}</span>
                </button>
              )
            })}
          </div>

          {selectedDay != null && (
            <div className="cal-daylist">
              <div className="ct-sec">
                {base.toLocaleDateString([], { month: 'short' })} {selectedDay}
              </div>
              {dayEvents.length ? (
                dayEvents.map((e, i) => (
                  <div className="ct-row" key={i}>
                    <span className="ct-tm">{timeOf(e)}</span>
                    <span className="ct-sum">{e.title}</span>
                  </div>
                ))
              ) : (
                <div className="ct-empty faint">no events that day</div>
              )}
            </div>
          )}

          <div className="cal-today">
            <div className="cal-today-h">
              TODAY ·{' '}
              {today.toLocaleDateString([], {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
              })}
            </div>
            <div className="ct-sec">Events</div>
            {todaysEvents.length ? (
              todaysEvents.map((e, i) => (
                <div className="ct-row" key={i}>
                  <span className="ct-tm">{timeOf(e)}</span>
                  <span className="ct-sum">{e.title}</span>
                </div>
              ))
            ) : (
              <div className="ct-empty faint">no events today</div>
            )}
            <div className="ct-sec">Tasks</div>
            {openTasks.length ? (
              openTasks.map((t) => (
                <div className="ct-row" key={t.id}>
                  <span className="ct-dot">▪</span>
                  <span className="ct-sum">{t.text}</span>
                </div>
              ))
            ) : (
              <div className="ct-empty faint">no open tasks</div>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
