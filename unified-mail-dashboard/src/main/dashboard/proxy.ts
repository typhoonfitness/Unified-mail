// Main-process fetchers for the dashboard. The main process has no CORS
// restriction, so it plays the role the Start Page's PowerShell server did.
// All fetches are timed out so a slow endpoint can't hang a card.

import type {
  CalendarEvent,
  DashboardConfig,
  GeoPlace,
  NewsItem,
  Quote,
  SocialPost,
  WeatherNow
} from '@shared/types'
import { parseFeed, parseIcs, parseStooqCsv } from './parsers'

// A browser-like UA — some finance/news endpoints reject generic agents.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'user-agent': BROWSER_UA, accept: '*/*' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } finally {
    clearTimeout(t)
  }
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  return JSON.parse(await fetchText(url, timeoutMs)) as T
}

// ---- weather (Open-Meteo, no API key) ----

const WMO: Record<number, string> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Rime fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Rain showers',
  81: 'Rain showers',
  82: 'Violent showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm + hail',
  99: 'Thunderstorm + hail'
}

export async function geocode(query: string): Promise<GeoPlace[]> {
  if (!query.trim()) return []
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
    query
  )}&count=5&language=en&format=json`
  const data = await fetchJson<{
    results?: Array<{
      name: string
      latitude: number
      longitude: number
      country?: string
      admin1?: string
    }>
  }>(url)
  return (data.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    country: r.country,
    admin1: r.admin1
  }))
}

export async function weather(
  config: DashboardConfig
): Promise<WeatherNow | null> {
  const p = config.weather
  if (!p) return null
  const unit = config.useFahrenheit ? 'fahrenheit' : 'celsius'
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&temperature_unit=${unit}&wind_speed_unit=kmh&timezone=auto&forecast_days=5`
  const data = await fetchJson<{
    current: { temperature_2m: number; weather_code: number; wind_speed_10m: number }
    hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] }
    daily: {
      time: string[]
      weather_code: number[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
    }
  }>(url)

  const c = data.current
  const tempMain = Math.round(c.temperature_2m)
  const daily = data.daily.time.map((iso, i) => ({
    day: new Date(iso).toLocaleDateString([], { weekday: 'short' }),
    high: Math.round(data.daily.temperature_2m_max[i]),
    low: Math.round(data.daily.temperature_2m_min[i]),
    code: data.daily.weather_code[i]
  }))

  // Next 12 hours from now.
  const now = Date.now()
  const hourly: WeatherNow['hourly'] = []
  for (let i = 0; i < data.hourly.time.length && hourly.length < 12; i++) {
    const t = new Date(data.hourly.time[i]).getTime()
    if (t < now - 3_600_000) continue
    hourly.push({
      hour: new Date(data.hourly.time[i]).toLocaleTimeString([], {
        hour: 'numeric'
      }),
      temp: Math.round(data.hourly.temperature_2m[i]),
      code: data.hourly.weather_code[i]
    })
  }

  return {
    place: p.name,
    tempC: config.useFahrenheit
      ? Math.round(((tempMain - 32) * 5) / 9)
      : tempMain,
    tempF: config.useFahrenheit
      ? tempMain
      : Math.round((tempMain * 9) / 5 + 32),
    code: c.weather_code,
    description: WMO[c.weather_code] ?? 'Unknown',
    windKph: Math.round(c.wind_speed_10m),
    high: daily[0]?.high ?? tempMain,
    low: daily[0]?.low ?? tempMain,
    daily,
    hourly
  }
}

// ---- markets (Stooq) ----

function symbolToStooq(sym: string): string {
  const s = sym.trim().toUpperCase()
  if (/-USD$/.test(s)) return s.replace('-USD', 'USD').toLowerCase() // BTC-USD -> btcusd
  if (/\.(US|UK|DE|PL)$/i.test(s)) return s.toLowerCase()
  return `${s.toLowerCase()}.us`
}

export async function quotes(config: DashboardConfig): Promise<Quote[]> {
  return quotesForSymbols(config.symbols)
}

// Primary quote source: Yahoo's v8 chart endpoint (no key, reliable, JSON).
async function yahooQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol
    )}?interval=1d&range=5d`
    const data = await fetchJson<{
      chart?: {
        result?: Array<{
          meta?: {
            regularMarketPrice?: number
            chartPreviousClose?: number
            previousClose?: number
          }
        }>
      }
    }>(url)
    const meta = data.chart?.result?.[0]?.meta
    if (!meta?.regularMarketPrice) return null
    const price = meta.regularMarketPrice
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change = price - prev
    return {
      symbol: symbol.toUpperCase(),
      price,
      change,
      changePct: prev ? (change / prev) * 100 : 0
    }
  } catch {
    return null
  }
}

async function stooqFallback(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>()
  try {
    const list = symbols.map(symbolToStooq).join(',')
    const csv = await fetchText(
      `https://stooq.com/q/l/?s=${encodeURIComponent(list)}&f=sd2t2ohlcv&h&e=csv`
    )
    for (const q of parseStooqCsv(csv)) out.set(q.symbol, q)
  } catch {
    /* ignore */
  }
  return out
}

export async function quotesForSymbols(symbols: string[]): Promise<Quote[]> {
  if (symbols.length === 0) return []
  // Try Yahoo per symbol in parallel.
  const yahoo = await Promise.all(symbols.map((s) => yahooQuote(s)))
  const needFallback = symbols.filter((_, i) => yahoo[i] === null)
  const fallback = needFallback.length
    ? await stooqFallback(needFallback)
    : new Map<string, Quote>()

  return symbols.map((requested, i) => {
    if (yahoo[i]) return yahoo[i] as Quote
    const norm = requested.toUpperCase().replace('-USD', 'USD')
    return (
      fallback.get(norm) ??
      fallback.get(requested.toUpperCase()) ?? {
        symbol: requested.toUpperCase(),
        price: NaN,
        change: 0,
        changePct: 0
      }
    )
  })
}

// ---- calendar (Google/other public iCal URL) ----

export async function calendar(config: DashboardConfig): Promise<CalendarEvent[]> {
  if (!config.icalUrl.trim()) return []
  // Google "webcal://" URLs are really https.
  const url = config.icalUrl.replace(/^webcal:\/\//i, 'https://')
  const ics = await fetchText(url, 15_000)
  const now = Date.now()
  const horizon = now + 30 * 86_400_000
  return parseIcs(ics)
    .filter((e) => (e.end ?? e.start) >= now && e.start <= horizon)
    .slice(0, 12)
}

// ---- news (RSS/Atom) ----

// Known topic -> feed URL(s). Enabling a topic adds its feeds to the news card.
export const TOPIC_FEEDS: Record<string, string[]> = {
  Technology: ['https://feeds.arstechnica.com/arstechnica/index'],
  AI: ['https://hnrss.org/newest?q=AI'],
  Business: ['https://feeds.a.dj.com/rss/RSSMarketsMain.xml'],
  Markets: ['https://www.cnbc.com/id/100003114/device/rss/rss.html'],
  Science: ['https://www.sciencedaily.com/rss/top/science.xml'],
  Space: ['https://www.nasa.gov/feed/'],
  World: ['http://feeds.bbci.co.uk/news/world/rss.xml'],
  US: ['https://feeds.npr.org/1001/rss.xml'],
  Guardian: ['https://www.theguardian.com/world/rss'],
  Reuters: ['https://www.reutersagency.com/feed/'],
  Gaming: ['https://www.theverge.com/games/rss/index.xml'],
  Sports: ['https://www.espn.com/espn/rss/news']
}

export const NEWS_TOPICS = Object.keys(TOPIC_FEEDS)

export async function news(config: DashboardConfig): Promise<NewsItem[]> {
  // Build a de-duplicated list of {url, topic} from enabled topic presets +
  // any custom feeds the user added, so each item can be tagged with its topic.
  const sources: Array<{ url: string; topic: string }> = []
  const seen = new Set<string>()
  const add = (url: string, topic: string): void => {
    if (seen.has(url)) return
    seen.add(url)
    sources.push({ url, topic })
  }
  for (const t of config.newsTopics ?? []) {
    for (const url of TOPIC_FEEDS[t] ?? []) add(url, t)
  }
  for (const url of config.newsFeeds) add(url, 'Custom')

  const all: NewsItem[] = []
  await Promise.all(
    sources.map(async ({ url, topic }) => {
      try {
        const xml = await fetchText(url)
        for (const item of parseFeed(xml, url)) all.push({ ...item, topic })
      } catch {
        // Skip a failing feed; others still show.
      }
    })
  )
  all.sort((a, b) => (b.published ?? 0) - (a.published ?? 0))
  return all.slice(0, 40)
}

// ---- social (Reddit + Bluesky public APIs, no auth) ----

async function redditPosts(sub: string): Promise<SocialPost[]> {
  const data = await fetchJson<{
    data?: { children?: Array<{ data: { title: string; permalink: string } }> }
  }>(`https://www.reddit.com/r/${encodeURIComponent(sub)}/hot.json?limit=8`)
  return (data.data?.children ?? []).map((c) => ({
    source: 'reddit' as const,
    author: `r/${sub}`,
    text: c.data.title,
    url: `https://www.reddit.com${c.data.permalink}`
  }))
}

async function blueskyPosts(handle: string): Promise<SocialPost[]> {
  const data = await fetchJson<{
    feed?: Array<{
      post: { uri: string; author: { handle: string }; record: { text?: string } }
    }>
  }>(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(
      handle
    )}&limit=8`
  )
  return (data.feed ?? [])
    .filter((f) => f.post.record.text)
    .map((f) => {
      const rkey = f.post.uri.split('/').pop() ?? ''
      return {
        source: 'bluesky' as const,
        author: `@${f.post.author.handle}`,
        text: f.post.record.text ?? '',
        url: `https://bsky.app/profile/${f.post.author.handle}/post/${rkey}`
      }
    })
}

export async function social(config: DashboardConfig): Promise<SocialPost[]> {
  const out: SocialPost[] = []
  await Promise.all([
    ...config.socialReddit.map(async (s) => {
      try {
        out.push(...(await redditPosts(s)))
      } catch {
        /* skip */
      }
    }),
    ...config.socialBluesky.map(async (h) => {
      try {
        out.push(...(await blueskyPosts(h)))
      } catch {
        /* skip */
      }
    })
  ])
  return out
}
