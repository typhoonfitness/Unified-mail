import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConnectedAccount, LayoutItem } from '../../../shared/types'
import WeatherCard from './dashboard/WeatherCard'
import MarketsCard from './dashboard/MarketsCard'
import PortfolioCard from './dashboard/PortfolioCard'
import CalendarCard from './dashboard/CalendarCard'
import TodoCard from './dashboard/TodoCard'
import LinksCard from './dashboard/LinksCard'
import NewsCard from './dashboard/NewsCard'
import MailCard from './dashboard/MailCard'
import YouTubeCard from './dashboard/YouTubeCard'
import MusicCard from './dashboard/MusicCard'
import MusicPlayerCard from './dashboard/MusicPlayerCard'
import VideoCard from './dashboard/VideoCard'
import ScreensaverCard from './dashboard/ScreensaverCard'
import ReaderCard from './dashboard/ReaderCard'
import Ticker from './dashboard/Ticker'
import InfoLine from './dashboard/InfoLine'
import DashboardSettings from './dashboard/DashboardSettings'

interface Props {
  accounts: ConnectedAccount[]
  onOpenMail: (threadId?: string) => void
  onManageAccounts: () => void
}

const COLS = 12
const ROW_PX = 14
const GRID_GAP = 16

// Default card order, widths (of 12 cols), and heights (row units of ~14px).
const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'mail', visible: true, w: 5, h: 22 },
  { id: 'weather', visible: true, w: 4, h: 22 },
  { id: 'markets', visible: true, w: 3, h: 22 },
  { id: 'portfolio', visible: true, w: 3, h: 20 },
  { id: 'player', visible: true, w: 6, h: 26 },
  { id: 'calendar', visible: true, w: 3, h: 26 },
  { id: 'todo', visible: true, w: 3, h: 26 },
  { id: 'news', visible: true, w: 5, h: 24 },
  { id: 'screensaver', visible: true, w: 4, h: 22 },
  { id: 'reader', visible: true, w: 6, h: 26 },
  { id: 'video', visible: true, w: 6, h: 24 },
  { id: 'youtube', visible: true, w: 6, h: 24 },
  { id: 'music', visible: true, w: 4, h: 16 },
  { id: 'links', visible: true, w: 4, h: 18 }
]

const CARD_LABELS: Record<string, string> = {
  mail: 'Mail',
  weather: 'Weather',
  markets: 'Markets',
  portfolio: 'Portfolio',
  calendar: 'Calendar',
  todo: 'To-Do',
  news: 'News',
  player: 'Player',
  video: 'Video / IPTV',
  screensaver: 'Screensaver',
  reader: 'Reader',
  youtube: 'YouTube',
  music: 'Music Stream',
  links: 'Links'
}

// Height presets (row units) for the S/M/L buttons.
const PRESET_H = { S: 14, M: 22, L: 34 }

function mergeLayout(saved: LayoutItem[]): LayoutItem[] {
  const defaults = new Map(DEFAULT_LAYOUT.map((d) => [d.id, d]))
  const seen = new Set<string>()
  const merged: LayoutItem[] = []
  for (const item of saved) {
    const def = defaults.get(item.id)
    if (!def || seen.has(item.id)) continue
    // Accept only the new {w,h} shape; fall back to defaults otherwise.
    const w =
      typeof item.w === 'number' ? Math.min(COLS, Math.max(2, item.w)) : def.w
    const h = typeof item.h === 'number' ? Math.max(6, item.h) : def.h
    merged.push({ id: item.id, visible: item.visible, w, h })
    seen.add(item.id)
  }
  for (const d of DEFAULT_LAYOUT) if (!seen.has(d.id)) merged.push(d)
  return merged
}

function greeting(h: number): string {
  if (h < 5) return 'Good night'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function useClock(): Date {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

export default function Dashboard({
  onOpenMail,
  onManageAccounts
}: Props): JSX.Element {
  const now = useClock()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [editMode, setEditMode] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const resizing = useRef<{ id: string; startX: number; startY: number; w: number; h: number } | null>(null)

  useEffect(() => {
    void window.api.dashboard.getConfig().then((c) => {
      setLayout(mergeLayout(c.layout ?? []))
    })
  }, [])

  const persist = useCallback((next: LayoutItem[]) => {
    setLayout(next)
    void window.api.dashboard.setConfig({ layout: next })
  }, [])

  const setSize = (id: string, w: number, h: number): void => {
    persist(
      layout.map((l) =>
        l.id === id
          ? { ...l, w: Math.min(COLS, Math.max(2, w)), h: Math.max(6, h) }
          : l
      )
    )
  }
  const setHeightPreset = (id: string, h: number): void => {
    const item = layout.find((l) => l.id === id)
    if (item) setSize(id, item.w, h)
  }
  const setVisible = (id: string, visible: boolean): void => {
    persist(layout.map((l) => (l.id === id ? { ...l, visible } : l)))
  }
  const reorder = (targetId: string): void => {
    if (!dragId || dragId === targetId) return
    const next = layout.filter((l) => l.id !== dragId)
    const dragItem = layout.find((l) => l.id === dragId)!
    const idx = next.findIndex((l) => l.id === targetId)
    next.splice(idx, 0, dragItem)
    persist(next)
    setDragId(null)
  }

  // Reliable reordering by button: move a card earlier/later, or to an end.
  const move = (id: string, where: 'first' | 'prev' | 'next' | 'last'): void => {
    const idx = layout.findIndex((l) => l.id === id)
    if (idx < 0) return
    const next = layout.slice()
    const [item] = next.splice(idx, 1)
    const target =
      where === 'first'
        ? 0
        : where === 'last'
          ? next.length
          : where === 'prev'
            ? Math.max(0, idx - 1)
            : Math.min(next.length, idx + 1)
    next.splice(target, 0, item)
    persist(next)
  }

  // Free-form corner resize: translate pixel drag into column/row spans.
  const onResizeStart = (e: React.PointerEvent, item: LayoutItem): void => {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = {
      id: item.id,
      startX: e.clientX,
      startY: e.clientY,
      w: item.w,
      h: item.h
    }
    const grid = gridRef.current
    const colPx = grid
      ? (grid.clientWidth - GRID_GAP * (COLS - 1)) / COLS + GRID_GAP
      : 100

    const move = (ev: PointerEvent): void => {
      const r = resizing.current
      if (!r) return
      const dw = Math.round((ev.clientX - r.startX) / colPx)
      const dh = Math.round((ev.clientY - r.startY) / (ROW_PX + GRID_GAP / 4))
      setLayout((prev) =>
        prev.map((l) =>
          l.id === r.id
            ? {
                ...l,
                w: Math.min(COLS, Math.max(2, r.w + dw)),
                h: Math.max(6, r.h + dh)
              }
            : l
        )
      )
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      // Persist final layout.
      setLayout((prev) => {
        void window.api.dashboard.setConfig({ layout: prev })
        return prev
      })
      resizing.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // Card element for each id (rebuilt so live data + refresh work).
  const cards: Record<string, JSX.Element> = useMemo(
    () => ({
      mail: <MailCard onOpenMail={onOpenMail} />,
      weather: <WeatherCard onSettings={() => setSettingsOpen(true)} />,
      markets: <MarketsCard onSettings={() => setSettingsOpen(true)} />,
      portfolio: <PortfolioCard onSettings={() => setSettingsOpen(true)} />,
      calendar: <CalendarCard onSettings={() => setSettingsOpen(true)} />,
      todo: <TodoCard />,
      news: <NewsCard onSettings={() => setSettingsOpen(true)} />,
      player: <MusicPlayerCard onSettings={() => setSettingsOpen(true)} />,
      video: <VideoCard />,
      screensaver: <ScreensaverCard onSettings={() => setSettingsOpen(true)} />,
      reader: <ReaderCard />,
      youtube: <YouTubeCard onSettings={() => setSettingsOpen(true)} />,
      music: <MusicCard onSettings={() => setSettingsOpen(true)} />,
      links: <LinksCard />
    }),
    // refreshKey remounts data cards after a settings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onOpenMail, refreshKey]
  )

  const hidden = layout.filter((l) => !l.visible)

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">UNIFIED MAIL</span>
        <span className="dash-greet">
          {greeting(now.getHours())}
          <span className="faint">
            {' '}
            ·{' '}
            {now.toLocaleDateString([], {
              weekday: 'long',
              month: 'short',
              day: 'numeric'
            })}
          </span>
        </span>
        <span className="info-sep">—</span>
        <InfoLine />
        <span className="spacer" />
        <span className="dash-clock glow">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button
          className={`link-btn ${editMode ? 'active-link' : ''}`}
          onClick={() => setEditMode((v) => !v)}
        >
          {editMode ? 'done' : 'layout'}
        </button>
        <button className="link-btn" onClick={() => onOpenMail()}>
          mail
        </button>
        <button className="link-btn" onClick={() => setSettingsOpen(true)}>
          dashboard
        </button>
        <button className="link-btn" onClick={onManageAccounts}>
          accounts
        </button>
      </div>

      <Ticker key={`tick-${refreshKey}`} />

      {editMode && hidden.length > 0 && (
        <div className="hidden-tray">
          <span className="faint">hidden:</span>
          {hidden.map((l) => (
            <button
              key={l.id}
              className="hd-act"
              onClick={() => setVisible(l.id, true)}
            >
              + {CARD_LABELS[l.id]}
            </button>
          ))}
        </div>
      )}

      <div
        ref={gridRef}
        className={`dash-grid ${editMode ? 'editing' : ''}`}
        style={{
          gridTemplateColumns: `repeat(${COLS}, 1fr)`,
          gridAutoRows: `${ROW_PX}px`
        }}
      >
        {layout
          .filter((l) => l.visible)
          .map((l) => (
            <div
              key={`${l.id}-${refreshKey}`}
              className="dash-cell"
              style={{ gridColumn: `span ${l.w}`, gridRow: `span ${l.h}` }}
              draggable={editMode}
              onDragStart={() => setDragId(l.id)}
              onDragOver={(e) => editMode && e.preventDefault()}
              onDrop={() => reorder(l.id)}
            >
              {editMode && (
                <div className="cell-edit">
                  <button
                    className="cell-btn"
                    onClick={() => move(l.id, 'first')}
                    title="move to start"
                  >
                    ⇤
                  </button>
                  <button
                    className="cell-btn"
                    onClick={() => move(l.id, 'prev')}
                    title="move earlier"
                  >
                    ◀
                  </button>
                  <button
                    className="cell-btn"
                    onClick={() => move(l.id, 'next')}
                    title="move later"
                  >
                    ▶
                  </button>
                  <button
                    className="cell-btn"
                    onClick={() => move(l.id, 'last')}
                    title="move to end"
                  >
                    ⇥
                  </button>
                  <span className="cell-sep" />
                  {(['S', 'M', 'L'] as const).map((p) => (
                    <button
                      key={p}
                      className="cell-btn"
                      onClick={() => setHeightPreset(l.id, PRESET_H[p])}
                      title={`height ${p}`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className="cell-btn"
                    onClick={() => setVisible(l.id, false)}
                    title="hide"
                  >
                    ×
                  </button>
                </div>
              )}
              {cards[l.id]}
              {editMode && (
                <div
                  className="cell-resize"
                  title="drag to resize"
                  onPointerDown={(e) => onResizeStart(e, l)}
                />
              )}
            </div>
          ))}
      </div>

      {settingsOpen && (
        <DashboardSettings
          onClose={() => setSettingsOpen(false)}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  )
}
