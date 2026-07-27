// Pure parsers for the dashboard feeds. Kept dependency-free and unit-tested.

import type { CalendarEvent, NewsItem, Quote } from '@shared/types'

// ---------------------------------------------------------------------------
// iCalendar (.ics) — minimal VEVENT extraction
// ---------------------------------------------------------------------------

// Unfold folded lines (RFC 5545: continuation lines start with space/tab).
function unfold(ics: string): string[] {
  const raw = ics.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function parseIcsDate(value: string): { ms: number; allDay: boolean } {
  // Forms: 20240115 (all-day), 20240115T093000Z, 20240115T093000
  const allDay = !value.includes('T')
  const m = value.match(
    /(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/
  )
  if (!m) return { ms: Date.now(), allDay }
  const [, y, mo, d, hh, mi, ss, z] = m
  if (allDay) {
    return { ms: Date.UTC(+y, +mo - 1, +d), allDay: true }
  }
  if (z) {
    return {
      ms: Date.UTC(+y, +mo - 1, +d, +hh, +mi, +(ss ?? '0')),
      allDay: false
    }
  }
  // Floating local time.
  return {
    ms: new Date(+y, +mo - 1, +d, +hh, +mi, +(ss ?? '0')).getTime(),
    allDay: false
  }
}

export function parseIcs(ics: string): CalendarEvent[] {
  const lines = unfold(ics)
  const events: CalendarEvent[] = []
  let cur: Partial<CalendarEvent> & { _startAllDay?: boolean } = {}
  let inEvent = false

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur.title && typeof cur.start === 'number') {
        events.push({
          title: cur.title,
          start: cur.start,
          end: cur.end ?? null,
          allDay: cur._startAllDay ?? false,
          location: cur.location
        })
      }
      inEvent = false
      continue
    }
    if (!inEvent) continue

    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx)
    const val = line.slice(idx + 1)
    const name = key.split(';')[0]

    if (name === 'SUMMARY') cur.title = unescapeIcs(val)
    else if (name === 'LOCATION') cur.location = unescapeIcs(val)
    else if (name === 'DTSTART') {
      const p = parseIcsDate(val)
      cur.start = p.ms
      cur._startAllDay = p.allDay
    } else if (name === 'DTEND') {
      cur.end = parseIcsDate(val).ms
    }
  }
  return events.sort((a, b) => a.start - b.start)
}

function unescapeIcs(s: string): string {
  return s
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

// ---------------------------------------------------------------------------
// RSS / Atom
// ---------------------------------------------------------------------------

function tag(block: string, name: string): string | null {
  const m = block.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i')
  )
  if (!m) return null
  return decodeEntities(stripCdata(m[1]).trim())
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function parseFeed(xml: string, sourceHint = ''): NewsItem[] {
  const source =
    tag(xml.split(/<item[\s>]/i)[0] ?? '', 'title') ||
    sourceHint ||
    'feed'

  const items: NewsItem[] = []
  // RSS <item> or Atom <entry>.
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? []
  for (const block of blocks) {
    const title = tag(block, 'title') ?? '(untitled)'
    let link = tag(block, 'link')
    if (!link) {
      // Atom link is an attribute.
      const m = block.match(/<link[^>]*href="([^"]+)"/i)
      link = m ? m[1] : ''
    }
    const dateStr =
      tag(block, 'pubDate') ?? tag(block, 'updated') ?? tag(block, 'published')
    const published = dateStr ? Date.parse(dateStr) || null : null
    items.push({ title, link: link ?? '', source, published })
  }
  return items
}

// ---------------------------------------------------------------------------
// Stooq CSV quotes:  Symbol,Date,Time,Open,High,Low,Close,Volume
// ---------------------------------------------------------------------------

export function parseStooqCsv(csv: string): Quote[] {
  const lines = csv.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const header = lines[0].toLowerCase().split(',')
  const iSym = header.indexOf('symbol')
  const iClose = header.indexOf('close')
  const iOpen = header.indexOf('open')
  const out: Quote[] = []
  for (const line of lines.slice(1)) {
    const cols = line.split(',')
    const symbol = cols[iSym] ?? ''
    const close = Number(cols[iClose])
    const open = Number(cols[iOpen])
    if (!symbol || Number.isNaN(close)) continue
    const change = Number.isNaN(open) ? 0 : close - open
    const changePct = open ? (change / open) * 100 : 0
    out.push({
      symbol: symbol.toUpperCase().replace(/\.US$/i, ''),
      price: close,
      change,
      changePct
    })
  }
  return out
}
