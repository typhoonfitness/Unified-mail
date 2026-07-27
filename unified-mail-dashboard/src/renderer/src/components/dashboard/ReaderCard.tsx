import { useEffect, useMemo, useRef, useState } from 'react'
import Card from './Card'
import { extractPdfText } from '../../lib/pdf'
import {
  TtsController,
  loadVoices,
  sortVoices,
  type TtsState
} from '../../lib/tts'

const LS = {
  voice: 'rd_voice',
  voice2: 'rd_voice2',
  rate: 'rd_rate',
  pitch: 'rd_pitch',
  dialogue: 'rd_dialogue'
}

export default function ReaderCard(): JSX.Element {
  const [pages, setPages] = useState<string[]>([])
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const [voiceList, setVoiceList] = useState<
    Array<{ voice: SpeechSynthesisVoice; label: string }>
  >([])
  const [mainVoice, setMainVoice] = useState(
    localStorage.getItem(LS.voice) ?? ''
  )
  const [secondVoice, setSecondVoice] = useState(
    localStorage.getItem(LS.voice2) ?? ''
  )
  const [dialogue, setDialogue] = useState(
    localStorage.getItem(LS.dialogue) === '1'
  )
  const [rate, setRate] = useState(Number(localStorage.getItem(LS.rate)) || 1)
  const [pitch, setPitch] = useState(Number(localStorage.getItem(LS.pitch)) || 1)
  const [ttsState, setTtsState] = useState<TtsState>('idle')

  const ttsRef = useRef<TtsController | null>(null)
  if (!ttsRef.current) ttsRef.current = new TtsController()

  // Load voices once and wire controller callbacks.
  useEffect(() => {
    const tts = ttsRef.current!
    tts.onState = setTtsState
    void loadVoices().then((voices) => {
      tts.setVoices(voices)
      const sorted = sortVoices(voices)
      setVoiceList(sorted)
      setMainVoice((cur) => cur || sorted[0]?.voice.name || '')
      setSecondVoice((cur) => cur || sorted[1]?.voice.name || sorted[0]?.voice.name || '')
    })
    return () => tts.stop()
  }, [])

  // Keep controller params + persistence in sync.
  useEffect(() => {
    const tts = ttsRef.current!
    tts.rate = rate
    tts.pitch = pitch
    localStorage.setItem(LS.rate, String(rate))
    localStorage.setItem(LS.pitch, String(pitch))
  }, [rate, pitch])
  useEffect(() => {
    if (mainVoice) localStorage.setItem(LS.voice, mainVoice)
  }, [mainVoice])
  useEffect(() => {
    if (secondVoice) localStorage.setItem(LS.voice2, secondVoice)
  }, [secondVoice])
  useEffect(() => {
    localStorage.setItem(LS.dialogue, dialogue ? '1' : '0')
  }, [dialogue])

  const fullText = useMemo(() => pages.join('\n\n'), [pages])

  const openPdf = (): void => fileRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    if (!file) return
    ttsRef.current?.stop()
    setBusy(true)
    setError('')
    setPages([])
    setFileName(file.name)
    try {
      const buf = await file.arrayBuffer()
      const { pages: p, hasText } = await extractPdfText(buf)
      setPages(p)
      if (!hasText) {
        setError('No selectable text — this looks like a scanned/image PDF.')
      }
    } catch (err) {
      setError(`Could not read PDF: ${(err as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const play = (): void => {
    const tts = ttsRef.current!
    if (ttsState === 'paused') {
      tts.resume()
      return
    }
    if (!fullText.trim()) return
    tts.play(fullText, { mainVoice, secondVoice, dialogue })
  }

  return (
    <Card
      title={`Reader${fileName ? ` · ${fileName}` : ''}`}
      status={busy ? 'busy' : pages.length ? 'ok' : 'none'}
      className="dash-card--media"
      actions={
        <button className="hd-act" onClick={openPdf}>
          open pdf
        </button>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: 'none' }}
        onChange={onFile}
      />

      <div className="tts-bar">
        <button
          className="hd-act"
          onClick={play}
          disabled={!pages.length && ttsState === 'idle'}
        >
          {ttsState === 'playing' ? '❚❚ pause…' : '▶ read'}
        </button>
        {ttsState === 'playing' && (
          <button className="hd-act" onClick={() => ttsRef.current?.pause()}>
            pause
          </button>
        )}
        <button className="hd-act" onClick={() => ttsRef.current?.stop()}>
          ■ stop
        </button>
        <select value={mainVoice} onChange={(e) => setMainVoice(e.target.value)}>
          {voiceList.map((v) => (
            <option key={v.voice.name} value={v.voice.name}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div className="tts-bar">
        <label className="tts-ctl">
          speed
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
        <label className="tts-ctl">
          pitch
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))}
          />
        </label>
        <label className="tts-ctl">
          <input
            type="checkbox"
            checked={dialogue}
            onChange={(e) => setDialogue(e.target.checked)}
          />
          dialogue
        </label>
        {dialogue && (
          <select
            value={secondVoice}
            onChange={(e) => setSecondVoice(e.target.value)}
            title="second voice for quoted dialogue"
          >
            {voiceList.map((v) => (
              <option key={v.voice.name} value={v.voice.name}>
                {v.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="down tts-msg">{error}</div>}

      <div className="reader-text">
        {pages.length === 0 && !busy && !error && (
          <div className="faint dash-empty">open a text PDF to read it here</div>
        )}
        {pages.map((p, i) => (
          <div className="pdf-page" key={i}>
            {p || <span className="faint">(no text on page {i + 1})</span>}
          </div>
        ))}
      </div>
    </Card>
  )
}
