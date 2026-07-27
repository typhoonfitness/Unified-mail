import { describe, it, expect } from 'vitest'
import { matchAmbientForGif, mimeForMedia } from './match'
import type { MediaFile } from '@shared/types'

const ambient: MediaFile[] = [
  'Cyberpunk.mp3',
  'Desert.mp3',
  'Forest Sounds.mp3',
  'Heavy Rain & Thunder.mp3',
  'Jungle waterfall.mp3',
  'Noir Jazz Mix.mp3',
  'Ocean Waves (1).mp3',
  'Snow storm.mp3'
].map((name) => ({ name, url: `media://ambient/${encodeURIComponent(name)}` }))

describe('matchAmbientForGif', () => {
  it('matches snow gifs to the snow storm track', () => {
    expect(matchAmbientForGif('snowfall-pixel.gif', ambient)?.name).toBe(
      'Snow storm.mp3'
    )
  })

  it('matches desert gifs to the desert track', () => {
    expect(
      matchAmbientForGif('guardians-of-the-desert-color.gif', ambient)?.name
    ).toBe('Desert.mp3')
  })

  it('maps rain/storm keywords to rain & thunder', () => {
    expect(matchAmbientForGif('rainy-night.gif', ambient)?.name).toBe(
      'Heavy Rain & Thunder.mp3'
    )
  })

  it('maps neon/cyber to cyberpunk', () => {
    expect(matchAmbientForGif('neon-city.gif', ambient)?.name).toBe(
      'Cyberpunk.mp3'
    )
  })

  it('returns null for an unrelated hashed filename', () => {
    expect(matchAmbientForGif('f36b8915b6c60753.gif', ambient)).toBeNull()
  })
})

describe('mimeForMedia', () => {
  it('maps common extensions', () => {
    expect(mimeForMedia('a.gif')).toBe('image/gif')
    expect(mimeForMedia('b.mp3')).toBe('audio/mpeg')
    expect(mimeForMedia('c.unknown')).toBe('application/octet-stream')
  })
})
