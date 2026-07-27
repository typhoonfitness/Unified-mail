// Multi-voice text-to-speech using the Web Speech API (speechSynthesis).
// On Windows/Edge this exposes high-quality neural voices. Long text is split
// into <=220-char utterances chained via onend to dodge the ~15s cutoff bug.
// Optional "dialogue mode" alternates a second voice for double-quoted passages.

const MAX_CHUNK = 220

export type TtsState = 'idle' | 'playing' | 'paused'

// Voices may load asynchronously; resolve once they're available.
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const existing = speechSynthesis.getVoices()
    if (existing.length) {
      resolve(existing)
      return
    }
    const handler = (): void => {
      resolve(speechSynthesis.getVoices())
      speechSynthesis.removeEventListener('voiceschanged', handler)
    }
    speechSynthesis.addEventListener('voiceschanged', handler)
    // Fallback in case the event never fires.
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1000)
  })
}

interface Segment {
  text: string
  voiceName?: string
}

interface SpeakOptions {
  mainVoice?: string
  secondVoice?: string
  dialogue?: boolean
}

// Split text into quoted / unquoted runs (double quotes only, straight+curly).
export function splitDialogue(
  text: string
): Array<{ text: string; quote: boolean }> {
  const runs: Array<{ text: string; quote: boolean }> = []
  let buf = ''
  let inQuote = false
  const isQuoteChar = (ch: string): boolean =>
    ch === '"' || ch === '“' || ch === '”'
  for (const ch of text) {
    if (isQuoteChar(ch)) {
      if (buf) runs.push({ text: buf, quote: inQuote })
      buf = ''
      inQuote = !inQuote
    } else {
      buf += ch
    }
  }
  if (buf) runs.push({ text: buf, quote: inQuote })
  return runs
}

// Break a run into <=MAX_CHUNK pieces at sentence/space boundaries.
export function chunk(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > MAX_CHUNK && cur) {
      out.push(cur.trim())
      cur = ''
    }
    if (s.length > MAX_CHUNK) {
      // Very long sentence: hard-split on spaces.
      for (const word of s.split(/\s+/)) {
        if ((cur + ' ' + word).length > MAX_CHUNK && cur) {
          out.push(cur.trim())
          cur = ''
        }
        cur += (cur ? ' ' : '') + word
      }
    } else {
      cur += s
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out.filter(Boolean)
}

export function segment(text: string, opts: SpeakOptions): Segment[] {
  if (!opts.dialogue || !opts.secondVoice) {
    return chunk(text).map((t) => ({ text: t, voiceName: opts.mainVoice }))
  }
  const segments: Segment[] = []
  let quoteIdx = 0
  for (const run of splitDialogue(text)) {
    // Narration -> main; quotes alternate main/second by turn.
    let voiceName = opts.mainVoice
    if (run.quote) {
      voiceName = quoteIdx % 2 === 0 ? opts.mainVoice : opts.secondVoice
      quoteIdx++
    }
    for (const t of chunk(run.text)) segments.push({ text: t, voiceName })
  }
  return segments
}

export class TtsController {
  rate = 1
  pitch = 1
  onState?: (s: TtsState) => void
  onProgress?: (index: number, total: number) => void

  private segments: Segment[] = []
  private i = 0
  private _state: TtsState = 'idle'
  private voices: SpeechSynthesisVoice[] = []

  setVoices(v: SpeechSynthesisVoice[]): void {
    this.voices = v
  }

  get state(): TtsState {
    return this._state
  }

  private setState(s: TtsState): void {
    this._state = s
    this.onState?.(s)
  }

  private voiceByName(name?: string): SpeechSynthesisVoice | null {
    if (!name) return null
    return this.voices.find((v) => v.name === name) ?? null
  }

  play(text: string, opts: SpeakOptions): void {
    this.stop()
    this.segments = segment(text, opts)
    this.i = 0
    if (this.segments.length === 0) return
    this.setState('playing')
    this.speakNext()
  }

  private speakNext(): void {
    if (this.i >= this.segments.length) {
      this.setState('idle')
      return
    }
    const seg = this.segments[this.i]
    this.onProgress?.(this.i, this.segments.length)
    this.i++
    const u = new SpeechSynthesisUtterance(seg.text)
    const v = this.voiceByName(seg.voiceName)
    if (v) u.voice = v
    u.rate = this.rate
    u.pitch = this.pitch
    u.onend = (): void => {
      if (this._state === 'playing') this.speakNext()
    }
    speechSynthesis.speak(u)
  }

  pause(): void {
    if (this._state === 'playing') {
      speechSynthesis.pause()
      this.setState('paused')
    }
  }

  resume(): void {
    if (this._state === 'paused') {
      speechSynthesis.resume()
      this.setState('playing')
    }
  }

  stop(): void {
    speechSynthesis.cancel()
    this.segments = []
    this.i = 0
    this.setState('idle')
  }
}

// Sort voices US -> UK -> AU -> others, and tag with a short locale label.
export function sortVoices(
  voices: SpeechSynthesisVoice[]
): Array<{ voice: SpeechSynthesisVoice; label: string }> {
  const rank = (lang: string): number => {
    const l = lang.toLowerCase()
    if (l.startsWith('en-us')) return 0
    if (l.startsWith('en-gb')) return 1
    if (l.startsWith('en-au')) return 2
    if (l.startsWith('en')) return 3
    return 4
  }
  return voices
    .slice()
    .sort((a, b) => rank(a.lang) - rank(b.lang) || a.name.localeCompare(b.name))
    .map((voice) => ({
      voice,
      label: `${voice.name} (${voice.lang})`
    }))
}
