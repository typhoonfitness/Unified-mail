import { useCallback, useEffect, useState } from 'react'
import type { MediaFile } from '../../../../shared/types'
import Card from './Card'
import { setChannel, getAudioState } from '../../lib/audioBus'

// Screensaver GIF card with a color tint and ambient sound that matches the
// scene. Audio plays through the app-level bus, so it keeps playing when you
// switch to the mail tab.
export default function ScreensaverCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const busInit = getAudioState().ambient
  const [gifs, setGifs] = useState<MediaFile[]>([])
  const [ambient, setAmbient] = useState<MediaFile[]>([])
  const [idx, setIdx] = useState(0)
  const [soundMode, setSoundMode] = useState<'auto' | string>(
    busInit.url ?? 'auto'
  )
  const [muted, setMuted] = useState(!busInit.playing)
  const [volume, setVolume] = useState(busInit.volume)
  const [tint, setTint] = useState('#000000')
  const [tintOn, setTintOn] = useState(false)
  const [currentSound, setCurrentSound] = useState<MediaFile | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void window.api.dashboard.listGifs().then(async (g) => {
      setGifs(g)
      const cfg = await window.api.settings.get()
      const startIdx = cfg.ambientGif
        ? g.findIndex((x) => x.url === cfg.ambientGif)
        : -1
      setIdx(startIdx >= 0 ? startIdx : g.length ? Math.floor(Math.random() * g.length) : 0)
    })
    void window.api.dashboard.listAmbient().then(setAmbient)
  }, [])

  const gif = gifs[idx] ?? null

  const resolveSound = useCallback(async (): Promise<void> => {
    if (soundMode !== 'auto') {
      setCurrentSound(ambient.find((a) => a.url === soundMode) ?? null)
      return
    }
    if (!gif) {
      setCurrentSound(null)
      return
    }
    const match = await window.api.dashboard.matchAmbient(gif.name)
    setCurrentSound(match ?? ambient[0] ?? null)
  }, [soundMode, gif, ambient])

  useEffect(() => {
    void resolveSound()
  }, [resolveSound])

  // Drive the persistent ambient channel.
  useEffect(() => {
    setChannel('ambient', {
      url: currentSound?.url ?? null,
      label: currentSound?.name,
      playing: !muted && !!currentSound,
      volume
    })
  }, [currentSound, muted, volume])

  const next = (): void => {
    if (gifs.length) setIdx((i) => (i + 1) % gifs.length)
  }
  const random = (): void => {
    if (gifs.length) setIdx(Math.floor(Math.random() * gifs.length))
  }

  const setAsStartup = async (): Promise<void> => {
    await window.api.settings.set({
      ambientAutostart: true,
      ambientGif: gif?.url ?? '',
      ambientTrack: currentSound?.url ?? '',
      ambientVolume: volume
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <Card
      title="Screensaver"
      className="dash-card--media"
      actions={
        <>
          <button className="hd-act" onClick={next}>
            next
          </button>
          <button className="hd-act" onClick={random}>
            random
          </button>
          <button className="hd-act" onClick={setAsStartup}>
            {saved ? 'saved ✓' : '★ startup'}
          </button>
          <button className="hd-act" onClick={onSettings}>
            folders
          </button>
        </>
      }
    >
      <div className="saver-stage">
        {gif ? (
          <img className="saver-img" src={gif.url} alt={gif.name} />
        ) : (
          <div className="faint dash-empty" style={{ padding: 24 }}>
            no gifs found — set a folder
          </div>
        )}
        {tintOn && (
          <div
            className="saver-tint"
            style={{ background: tint, opacity: 0.35 }}
          />
        )}
      </div>

      <div className="saver-controls">
        <button
          className="hd-act"
          onClick={() => setMuted((m) => !m)}
          title={currentSound?.name ?? 'no sound'}
        >
          {muted ? '🔇 sound off' : '🔊 sound on'}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <select value={soundMode} onChange={(e) => setSoundMode(e.target.value)}>
          <option value="auto">auto-match</option>
          {ambient.map((a) => (
            <option key={a.url} value={a.url}>
              {a.name}
            </option>
          ))}
        </select>
        <label className="saver-tint-ctl">
          <input
            type="checkbox"
            checked={tintOn}
            onChange={(e) => setTintOn(e.target.checked)}
          />
          tint
          <input
            type="color"
            value={tint}
            onChange={(e) => setTint(e.target.value)}
          />
        </label>
      </div>
      {currentSound && !muted && (
        <div className="saver-now faint">♪ {currentSound.name}</div>
      )}
    </Card>
  )
}
