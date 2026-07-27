import { describe, it, expect } from 'vitest'
import { parseIcs, parseFeed, parseStooqCsv } from './parsers'

describe('parseIcs', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:Team sync',
    'DTSTART:20240115T093000Z',
    'DTEND:20240115T100000Z',
    'LOCATION:Room 4',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'SUMMARY:All day off',
    'DTSTART;VALUE=DATE:20240116',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n')

  it('extracts events with summary, times, and all-day flag', () => {
    const events = parseIcs(ics)
    expect(events).toHaveLength(2)
    expect(events[0].title).toBe('Team sync')
    expect(events[0].allDay).toBe(false)
    expect(events[0].location).toBe('Room 4')
    expect(events[0].start).toBe(Date.UTC(2024, 0, 15, 9, 30, 0))
    expect(events[1].title).toBe('All day off')
    expect(events[1].allDay).toBe(true)
  })

  it('unfolds folded lines', () => {
    const folded =
      'BEGIN:VEVENT\r\nSUMMARY:Long ti\r\n tle here\r\nDTSTART:20240115\r\nEND:VEVENT'
    const [e] = parseIcs(folded)
    expect(e.title).toBe('Long title here')
  })
})

describe('parseFeed', () => {
  it('parses RSS items', () => {
    const xml = `<rss><channel><title>My Feed</title>
      <item><title>First</title><link>https://x.com/1</link>
        <pubDate>Mon, 15 Jan 2024 10:00:00 GMT</pubDate></item>
      <item><title><![CDATA[Second & third]]></title><link>https://x.com/2</link></item>
    </channel></rss>`
    const items = parseFeed(xml)
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe('First')
    expect(items[0].link).toBe('https://x.com/1')
    expect(items[0].published).toBe(Date.parse('Mon, 15 Jan 2024 10:00:00 GMT'))
    expect(items[1].title).toBe('Second & third')
  })

  it('parses Atom entries with href links', () => {
    const xml = `<feed><title>Atom</title>
      <entry><title>Hello</title><link href="https://a.com/x"/>
        <updated>2024-01-15T10:00:00Z</updated></entry>
    </feed>`
    const items = parseFeed(xml)
    expect(items[0].title).toBe('Hello')
    expect(items[0].link).toBe('https://a.com/x')
  })
})

describe('parseStooqCsv', () => {
  it('computes change and percent from open/close', () => {
    const csv =
      'Symbol,Date,Time,Open,High,Low,Close,Volume\n' +
      'AAPL.US,2024-01-15,22:00:00,100,105,99,110,1000\n' +
      'SPY.US,2024-01-15,22:00:00,400,401,398,396,2000'
    const q = parseStooqCsv(csv)
    expect(q[0].symbol).toBe('AAPL')
    expect(q[0].price).toBe(110)
    expect(q[0].change).toBe(10)
    expect(q[0].changePct).toBeCloseTo(10)
    expect(q[1].change).toBe(-4)
    expect(q[1].changePct).toBeCloseTo(-1)
  })

  it('skips rows with N/D close', () => {
    const csv = 'Symbol,Date,Time,Open,High,Low,Close,Volume\nXYZ.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D'
    expect(parseStooqCsv(csv)).toHaveLength(0)
  })
})
