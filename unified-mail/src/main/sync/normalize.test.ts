import { describe, it, expect } from 'vitest'
import {
  normalizeSubject,
  parseAddressList,
  parseSingleAddress,
  unifiedThreadId
} from './normalize'

describe('normalizeSubject', () => {
  it('strips reply/forward prefixes and lowercases', () => {
    expect(normalizeSubject('Re: Hello')).toBe('hello')
    expect(normalizeSubject('FWD: RE: Hello')).toBe('hello')
    expect(normalizeSubject('  Fw:  Spaced  Out ')).toBe('spaced out')
  })
})

describe('parseAddress', () => {
  it('parses a named address', () => {
    expect(parseSingleAddress('Jane Doe <jane@x.com>')).toEqual({
      name: 'Jane Doe',
      email: 'jane@x.com'
    })
  })
  it('parses a bare address', () => {
    expect(parseSingleAddress('bob@y.com')).toEqual({
      name: null,
      email: 'bob@y.com'
    })
  })
  it('splits a list without breaking quoted commas', () => {
    const list = parseAddressList('"Doe, Jane" <jane@x.com>, bob@y.com')
    expect(list).toHaveLength(2)
    expect(list[0].email).toBe('jane@x.com')
    expect(list[1].email).toBe('bob@y.com')
  })
})

describe('unifiedThreadId', () => {
  it('merges the same conversation across providers', () => {
    const gmail = unifiedThreadId({
      subject: 'Re: Project sync',
      participants: ['jane@x.com', 'me@x.com'],
      providerThreadId: 'gmail-thread-1',
      provider: 'google'
    })
    const outlook = unifiedThreadId({
      subject: 'Project sync',
      participants: ['me@x.com', 'jane@x.com'], // different order
      providerThreadId: 'outlook-conv-1',
      provider: 'microsoft'
    })
    expect(gmail).toBe(outlook)
  })

  it('does not merge empty-subject messages across providers', () => {
    const a = unifiedThreadId({
      subject: '',
      participants: ['jane@x.com'],
      providerThreadId: 'thread-a',
      provider: 'google'
    })
    const b = unifiedThreadId({
      subject: '',
      participants: ['jane@x.com'],
      providerThreadId: 'thread-b',
      provider: 'microsoft'
    })
    expect(a).not.toBe(b)
  })
})
