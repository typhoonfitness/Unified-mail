import { describe, it, expect } from 'vitest'
import { chunk, splitDialogue, segment } from './tts'

describe('chunk', () => {
  it('keeps chunks under the cap and splits on sentences', () => {
    const text = 'One sentence here. '.repeat(30) // ~570 chars
    const chunks = chunk(text)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(220)
  })

  it('returns a single chunk for short text', () => {
    expect(chunk('Hello there.')).toEqual(['Hello there.'])
  })
})

describe('splitDialogue', () => {
  it('separates quoted and unquoted runs', () => {
    const runs = splitDialogue('He said "hello there" and left.')
    expect(runs.map((r) => r.quote)).toEqual([false, true, false])
    expect(runs[1].text).toBe('hello there')
  })

  it('handles curly quotes', () => {
    const runs = splitDialogue('She said “hi” softly')
    expect(runs.some((r) => r.quote && r.text === 'hi')).toBe(true)
  })
})

describe('segment', () => {
  it('assigns one voice when dialogue mode is off', () => {
    const segs = segment('A "quote" here.', {
      mainVoice: 'V1',
      secondVoice: 'V2',
      dialogue: false
    })
    expect(segs.every((s) => s.voiceName === 'V1')).toBe(true)
  })

  it('alternates the second voice for quotes in dialogue mode', () => {
    const segs = segment('Narr "first" mid "second" end', {
      mainVoice: 'V1',
      secondVoice: 'V2',
      dialogue: true
    })
    const first = segs.find((s) => s.text.includes('first'))
    const second = segs.find((s) => s.text.includes('second'))
    expect(first?.voiceName).toBe('V1') // first quote keeps main
    expect(second?.voiceName).toBe('V2') // second quote uses second voice
  })
})
