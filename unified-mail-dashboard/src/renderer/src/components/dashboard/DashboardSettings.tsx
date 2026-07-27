import { useEffect, useState } from 'react'
import type {
  DashboardConfig,
  GeoPlace,
  Holding
} from '../../../../shared/types'

interface Props {
  onClose: () => void
  onSaved: () => void
}

export default function DashboardSettings({
  onClose,
  onSaved
}: Props): JSX.Element {
  const [cfg, setCfg] = useState<DashboardConfig | null>(null)
  const [cityQuery, setCityQuery] = useState('')
  const [results, setResults] = useState<GeoPlace[]>([])
  const [symbols, setSymbols] = useState('')
  const [ical, setIcal] = useState('')
  const [feeds, setFeeds] = useState('')
  const [youtube, setYoutube] = useState('')
  const [spotify, setSpotify] = useState('')
  const [reddit, setReddit] = useState('')
  const [bluesky, setBluesky] = useState('')
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [hSym, setHSym] = useState('')
  const [hSh, setHSh] = useState('')
  const [hCost, setHCost] = useState('')
  const [topics, setTopics] = useState<string[]>([])

  const ALL_TOPICS = [
    'Technology',
    'AI',
    'Business',
    'Markets',
    'Science',
    'Space',
    'World',
    'US',
    'Guardian',
    'Reuters',
    'Gaming',
    'Sports'
  ]

  useEffect(() => {
    void window.api.dashboard.getConfig().then((c) => {
      setCfg(c)
      setSymbols(c.symbols.join(', '))
      setIcal(c.icalUrl)
      setFeeds(c.newsFeeds.join('\n'))
      setYoutube(c.youtubeUrl)
      setSpotify(c.spotifyUrl)
      setReddit(c.socialReddit.join(', '))
      setBluesky(c.socialBluesky.join(', '))
      setHoldings(c.holdings)
      setTopics(c.newsTopics ?? [])
    })
  }, [])

  const pasteInto = async (
    setter: (v: string) => void
  ): Promise<void> => {
    const text = await window.api.clipboard.read()
    if (text) setter(text.trim())
  }

  const toggleTopic = (t: string): void => {
    const next = topics.includes(t)
      ? topics.filter((x) => x !== t)
      : [...topics, t]
    setTopics(next)
    void window.api.dashboard.setConfig({ newsTopics: next }).then(onSaved)
  }

  const saveHoldings = async (next: Holding[]): Promise<void> => {
    setHoldings(next)
    await window.api.dashboard.setConfig({ holdings: next })
    onSaved()
  }
  const addHolding = (): void => {
    const symbol = hSym.trim().toUpperCase()
    const shares = Number(hSh)
    if (!symbol || !shares) return
    const cost = hCost ? Number(hCost) : undefined
    void saveHoldings([...holdings, { symbol, shares, cost }])
    setHSym('')
    setHSh('')
    setHCost('')
  }

  const search = async (): Promise<void> => {
    if (!cityQuery.trim()) return
    setResults(await window.api.dashboard.geocode(cityQuery))
  }

  const pickCity = async (p: GeoPlace): Promise<void> => {
    const next = await window.api.dashboard.setConfig({ weather: p })
    setCfg(next)
    setResults([])
    setCityQuery('')
    onSaved()
  }

  const saveAll = async (): Promise<void> => {
    await window.api.dashboard.setConfig({
      symbols: symbols
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      icalUrl: ical.trim(),
      newsFeeds: feeds
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      youtubeUrl: youtube.trim(),
      spotifyUrl: spotify.trim(),
      socialReddit: reddit
        .split(',')
        .map((s) => s.trim().replace(/^r\//i, ''))
        .filter(Boolean),
      socialBluesky: bluesky
        .split(',')
        .map((s) => s.trim().replace(/^@/, ''))
        .filter(Boolean),
      useFahrenheit: cfg?.useFahrenheit ?? true
    })
    onSaved()
    onClose()
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>Dashboard settings</span>
          <span className="spacer" />
          <button className="link-btn" onClick={onClose}>
            close
          </button>
        </div>
        <div className="settings-body">
          <div className="set-section">
            <div className="set-section-title">Weather location</div>
            <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
              current: {cfg?.weather?.name ?? 'none'}
            </div>
            <div className="link-add">
              <input
                value={cityQuery}
                placeholder="search a city…"
                onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void search()
                }}
              />
              <button className="hd-act" onClick={search}>
                search
              </button>
            </div>
            {results.map((p, i) => (
              <button
                key={i}
                className="palette-item"
                onClick={() => pickCity(p)}
              >
                <span>
                  {p.name}
                  <span className="faint">
                    {' '}
                    {[p.admin1, p.country].filter(Boolean).join(', ')}
                  </span>
                </span>
              </button>
            ))}
            <label className="set-row" style={{ marginTop: 8 }}>
              <span>Use Fahrenheit</span>
              <button
                className={`switch ${cfg?.useFahrenheit ? 'on' : ''}`}
                onClick={() =>
                  setCfg((c) => (c ? { ...c, useFahrenheit: !c.useFahrenheit } : c))
                }
              >
                <span className="knob" />
              </button>
            </label>
          </div>

          <div className="set-section">
            <div className="set-section-title">Markets — symbols</div>
            <input
              className="set-sig"
              value={symbols}
              placeholder="SPY, AAPL, MSFT, BTC-USD"
              onChange={(e) => setSymbols(e.target.value)}
            />
          </div>

          <div className="set-section">
            <div className="set-section-title">Portfolio holdings</div>
            {holdings.map((h, i) => (
              <div className="set-row" key={i}>
                <span>
                  {h.symbol} · {h.shares} sh
                  {h.cost != null ? ` · $${h.cost}/sh` : ''}
                </span>
                <button
                  className="hd-act"
                  onClick={() =>
                    void saveHoldings(holdings.filter((_, j) => j !== i))
                  }
                >
                  remove
                </button>
              </div>
            ))}
            <div className="link-add">
              <input
                style={{ maxWidth: 90 }}
                value={hSym}
                placeholder="AAPL"
                onChange={(e) => setHSym(e.target.value)}
              />
              <input
                style={{ maxWidth: 70 }}
                value={hSh}
                placeholder="shares"
                onChange={(e) => setHSh(e.target.value)}
              />
              <input
                style={{ maxWidth: 80 }}
                value={hCost}
                placeholder="cost/sh"
                onChange={(e) => setHCost(e.target.value)}
              />
              <button className="hd-act" onClick={addHolding}>
                add
              </button>
            </div>
          </div>

          <div className="set-section">
            <div className="set-section-title">Calendar — iCal URL</div>
            <div className="paste-row">
              <input
                className="set-sig"
                value={ical}
                placeholder="https://calendar.google.com/…/basic.ics"
                onChange={(e) => setIcal(e.target.value)}
              />
              <button className="hd-act" onClick={() => void pasteInto(setIcal)}>
                paste
              </button>
            </div>
          </div>

          <div className="set-section">
            <div className="set-section-title">News topics</div>
            <div className="topic-chips">
              {ALL_TOPICS.map((t) => (
                <button
                  key={t}
                  className={`topic-chip ${topics.includes(t) ? 'on' : ''}`}
                  onClick={() => toggleTopic(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="set-section">
            <div className="set-section-title">
              News — custom RSS feeds (one per line)
            </div>
            <textarea
              className="set-sig"
              rows={4}
              value={feeds}
              onChange={(e) => setFeeds(e.target.value)}
            />
          </div>

          <div className="set-section">
            <div className="set-section-title">YouTube — video or playlist URL</div>
            <div className="paste-row">
              <input
                className="set-sig"
                value={youtube}
                placeholder="https://www.youtube.com/watch?v=…"
                onChange={(e) => setYoutube(e.target.value)}
              />
              <button
                className="hd-act"
                onClick={() => void pasteInto(setYoutube)}
              >
                paste
              </button>
            </div>
          </div>

          <div className="set-section">
            <div className="set-section-title">Music — Spotify link</div>
            <div className="paste-row">
              <input
                className="set-sig"
                value={spotify}
                placeholder="https://open.spotify.com/playlist/…"
                onChange={(e) => setSpotify(e.target.value)}
              />
              <button
                className="hd-act"
                onClick={() => void pasteInto(setSpotify)}
              >
                paste
              </button>
            </div>
          </div>

          <div className="set-section">
            <div className="set-section-title">Social ticker — subreddits</div>
            <input
              className="set-sig"
              value={reddit}
              placeholder="technology, worldnews"
              onChange={(e) => setReddit(e.target.value)}
            />
          </div>

          <div className="set-section">
            <div className="set-section-title">
              Social ticker — Bluesky handles
            </div>
            <input
              className="set-sig"
              value={bluesky}
              placeholder="user.bsky.social, another.bsky.social"
              onChange={(e) => setBluesky(e.target.value)}
            />
          </div>

          <div className="set-section">
            <div className="set-section-title">Screensaver folders</div>
            <div className="set-row">
              <span>
                GIFs:{' '}
                <span className="faint">{cfg?.gifsFolder ?? ''}</span>
              </span>
              <button
                className="hd-act"
                onClick={async () => {
                  const p = await window.api.dashboard.pickFolder('gifs')
                  if (p) {
                    setCfg((c) => (c ? { ...c, gifsFolder: p } : c))
                    onSaved()
                  }
                }}
              >
                choose
              </button>
            </div>
            <div className="set-row">
              <span>
                Ambient:{' '}
                <span className="faint">{cfg?.ambientFolder ?? ''}</span>
              </span>
              <button
                className="hd-act"
                onClick={async () => {
                  const p = await window.api.dashboard.pickFolder('ambient')
                  if (p) {
                    setCfg((c) => (c ? { ...c, ambientFolder: p } : c))
                    onSaved()
                  }
                }}
              >
                choose
              </button>
            </div>
          </div>

          <div className="set-section">
            <div className="set-section-title">Music library folder</div>
            <div className="set-row">
              <span>
                Music:{' '}
                <span className="faint">{cfg?.musicFolder ?? ''}</span>
              </span>
              <button
                className="hd-act"
                onClick={async () => {
                  const p = await window.api.dashboard.pickFolder('music')
                  if (p) {
                    setCfg((c) => (c ? { ...c, musicFolder: p } : c))
                    onSaved()
                  }
                }}
              >
                choose
              </button>
            </div>
          </div>

          <div className="snip-form-actions">
            <button className="btn" onClick={saveAll}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
