import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'
import Card from './Card'
import { Visualizer, VIZ_MODES, type VizMode } from '../../lib/visualizer'

// Video / IPTV player: local video files + IPTV/HLS or MP4 streams, with a
// Web-Audio visualizer driven by whatever is playing.
export default function VideoCard(): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const hlsRef = useRef<Hls | null>(null)

  const audioRef = useRef<{
    ctx: AudioContext
    analyser: AnalyserNode
    source: MediaElementAudioSourceNode
  } | null>(null)
  const rafRef = useRef<number | null>(null)
  const vizRef = useRef<Visualizer | null>(null)
  if (!vizRef.current) vizRef.current = new Visualizer()

  const [streamUrl, setStreamUrl] = useState('')
  const [modeIdx, setModeIdx] = useState(0)
  const [vizOn, setVizOn] = useState(true)
  const [status, setStatus] = useState('')
  const mode: VizMode = VIZ_MODES[modeIdx]

  useEffect(() => {
    void window.api.dashboard.getConfig().then((c) => setStreamUrl(c.iptvUrl))
  }, [])

  const ensureAudio = (): void => {
    const video = videoRef.current
    if (!video || audioRef.current) return
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new Ctx()
    const source = ctx.createMediaElementSource(video)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)
    analyser.connect(ctx.destination)
    audioRef.current = { ctx, analyser, source }
  }

  useEffect(() => {
    const loop = (): void => {
      const canvas = canvasRef.current
      const audio = audioRef.current
      if (vizOn && canvas && audio) vizRef.current!.draw(mode, audio.analyser, canvas)
      else if (canvas) {
        const c = canvas.getContext('2d')
        c?.clearRect(0, 0, canvas.width, canvas.height)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [mode, vizOn])

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy()
      void audioRef.current?.ctx.close()
    }
  }, [])

  const afterPlay = async (): Promise<void> => {
    ensureAudio()
    if (audioRef.current?.ctx.state === 'suspended') {
      await audioRef.current.ctx.resume()
    }
    try {
      await videoRef.current?.play()
    } catch {
      /* the click is the gesture */
    }
  }

  const openFile = (): void => fileRef.current?.click()

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    const video = videoRef.current
    if (!file || !video) return
    hlsRef.current?.destroy()
    hlsRef.current = null
    video.src = URL.createObjectURL(file)
    setStatus(file.name)
    await afterPlay()
  }

  const playStream = async (): Promise<void> => {
    const video = videoRef.current
    const url = streamUrl.trim()
    if (!video || !url) return
    hlsRef.current?.destroy()
    hlsRef.current = null

    const isHls = /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true })
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) setStatus(`stream error: ${data.type}`)
      })
    } else {
      video.src = url
    }
    setStatus('streaming…')
    void window.api.dashboard.setConfig({ iptvUrl: url })
    await afterPlay()
  }

  return (
    <Card
      title="Video / IPTV"
      actions={
        <>
          <button
            className="hd-act"
            onClick={() => setModeIdx((i) => (i + 1) % VIZ_MODES.length)}
          >
            {mode}
          </button>
          <button className="hd-act" onClick={() => setVizOn((v) => !v)}>
            {vizOn ? 'viz on' : 'viz off'}
          </button>
        </>
      }
    >
      <div className="player-stage">
        <video ref={videoRef} className="player-video" controls playsInline />
        <canvas ref={canvasRef} className="player-viz" />
      </div>

      <div className="player-controls">
        <button className="hd-act" onClick={openFile}>
          open file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/*,audio/*"
          style={{ display: 'none' }}
          onChange={onFile}
        />
        <input
          className="player-url"
          value={streamUrl}
          placeholder="stream URL (.m3u8 / mp4)…"
          onChange={(e) => setStreamUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void playStream()
          }}
        />
        <button className="hd-act" onClick={playStream}>
          play
        </button>
      </div>
      {status && <div className="player-status faint">{status}</div>}
    </Card>
  )
}
