import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrate } from '../db/schema'
import { __setDbForTests } from '../db'
import {
  upsertMessages,
  listThreads,
  listMessages,
  getThread,
  setStarredLocal,
  removeMessageLocal
} from './store'
import type { NormalizedMessage } from './types'

function msg(over: Partial<NormalizedMessage> & { providerMessageId: string }): NormalizedMessage {
  return {
    accountId: 'google:me@x.com',
    provider: 'google',
    providerThreadId: 'pt',
    unifiedThreadId: 'unified-1',
    from: { name: 'Jane', email: 'jane@x.com' },
    to: [{ name: 'Me', email: 'me@x.com' }],
    cc: [],
    subject: 'Project sync',
    snippet: 'hello there',
    bodyHtml: null,
    bodyText: 'hello there body',
    receivedAt: 1000,
    isRead: false,
    isStarred: false,
    folder: 'inbox',
    labels: [],
    hasAttachments: false,
    attachments: [],
    bulk: false,
    unsubscribe: null,
    ...over
  }
}

beforeEach(() => {
  const db = new Database(':memory:')
  migrate(db)
  __setDbForTests(db)
})

describe('store: schema + thread aggregation', () => {
  it('creates all tables and the FTS index without error', () => {
    // migrate ran in beforeEach; a query proves the objects exist.
    expect(() => listThreads({})).not.toThrow()
    expect(() => listMessages({ search: 'anything' })).not.toThrow()
  })

  it('aggregates messages into a thread with unread + participants', () => {
    upsertMessages([
      msg({ providerMessageId: 'm1', receivedAt: 1000, isRead: true }),
      msg({ providerMessageId: 'm2', receivedAt: 2000, isRead: false })
    ])
    const threads = listThreads({})
    expect(threads).toHaveLength(1)
    expect(threads[0].messageCount).toBe(2)
    expect(threads[0].unreadCount).toBe(1)
    expect(threads[0].lastMessageId).toBe('google:me@x.com::m2')
    expect(threads[0].participants.map((p) => p.email)).toContain('jane@x.com')
  })

  it('merges a cross-provider message into the same unified thread', () => {
    upsertMessages([
      msg({ providerMessageId: 'm1', provider: 'google' }),
      msg({
        providerMessageId: 'o1',
        accountId: 'microsoft:me@x.com',
        provider: 'microsoft',
        providerThreadId: 'conv1'
      })
    ])
    const threads = listThreads({})
    expect(threads).toHaveLength(1)
    expect(threads[0].providers.sort()).toEqual(['google', 'microsoft'])
    expect(threads[0].accountIds).toHaveLength(2)
  })
})

describe('store: FTS search', () => {
  beforeEach(() => {
    upsertMessages([
      msg({ providerMessageId: 'm1', subject: 'Quarterly budget review' }),
      msg({
        providerMessageId: 'm2',
        unifiedThreadId: 'unified-2',
        subject: 'Lunch plans',
        bodyText: 'tacos on friday'
      })
    ])
  })

  it('matches by subject token', () => {
    const res = listMessages({ search: 'budget' })
    expect(res.map((m) => m.providerMessageId)).toEqual(['m1'])
  })

  it('matches by body token with prefix', () => {
    const res = listMessages({ search: 'taco' })
    expect(res.map((m) => m.providerMessageId)).toEqual(['m2'])
  })

  it('returns nothing for a non-matching query', () => {
    expect(listMessages({ search: 'zzzzz' })).toHaveLength(0)
  })
})

describe('store: mutations', () => {
  it('stars a message and reflects it on the thread', () => {
    upsertMessages([msg({ providerMessageId: 'm1' })])
    setStarredLocal('google:me@x.com::m1', true)
    expect(listThreads({})[0].hasStarred).toBe(true)
    const detail = getThread('unified-1')
    expect(detail?.messages[0].isStarred).toBe(true)
  })

  it('removes a message and deletes the now-empty thread', () => {
    upsertMessages([msg({ providerMessageId: 'm1' })])
    removeMessageLocal('google:me@x.com::m1')
    expect(listThreads({})).toHaveLength(0)
    expect(getThread('unified-1')).toBeNull()
  })
})
