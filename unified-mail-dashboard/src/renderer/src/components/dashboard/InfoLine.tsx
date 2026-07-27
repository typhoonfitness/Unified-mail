import { useEffect, useState } from 'react'

// A rotating info line (like the Start Page's): weather, next event, open
// tasks, top market mover, unread mail — cycled every few seconds.
export default function InfoLine(): JSX.Element {
  const [lines, setLines] = useState<string[]>([])
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    let alive = true
    const build = async (): Promise<void> => {
      const out: string[] = []
      try {
        const [wx, events, todos, quotes, threads] = await Promise.all([
          window.api.dashboard.weather(),
          window.api.dashboard.calendar(),
          window.api.dashboard.listTodos(),
          window.api.dashboard.quotes(),
          window.api.mail.listThreads({
            folder: 'inbox',
            unreadOnly: true,
            limit: 50
          })
        ])
        if (wx) out.push(`${wx.place}: ${wx.tempF}° ${wx.description}`)
        const next = events[0]
        if (next) {
          const when = next.allDay
            ? 'all day'
            : new Date(next.start).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit'
              })
          out.push(`Next: ${next.title} · ${when}`)
        }
        const open = todos.filter((t) => !t.done).length
        if (open) out.push(`${open} open task${open > 1 ? 's' : ''}`)
        const mover = quotes
          .filter((q) => !Number.isNaN(q.price))
          .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0]
        if (mover)
          out.push(
            `${mover.symbol} ${mover.changePct >= 0 ? '▲' : '▼'}${Math.abs(
              mover.changePct
            ).toFixed(2)}%`
          )
        if (threads.length)
          out.push(`${threads.length} unread email${threads.length > 1 ? 's' : ''}`)
      } catch {
        /* ignore */
      }
      if (alive) setLines(out)
    }
    void build()
    const refresh = setInterval(build, 120_000)
    return () => {
      alive = false
      clearInterval(refresh)
    }
  }, [])

  useEffect(() => {
    if (lines.length <= 1) return
    const t = setInterval(() => setIdx((i) => (i + 1) % lines.length), 7000)
    return () => clearInterval(t)
  }, [lines])

  if (lines.length === 0) return <span className="info-line" />
  return <span className="info-line">{lines[idx % lines.length]}</span>
}
