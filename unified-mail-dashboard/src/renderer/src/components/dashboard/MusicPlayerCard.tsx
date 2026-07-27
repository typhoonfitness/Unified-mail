import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FixedSizeList as List, type ListChildComponentProps } from 'react-window'
import Card from './Card'
import type { MediaFile, TrackMeta } from '../../../../shared/types'
import { Visualizer, VIZ_MODES, type VizMode } from '../../lib/visualizer'
import { setChannel } from '../../lib/audioBus'

function baseName(path: string): string {
  const file = path.split('/').pop() ?? path
  return file.replace(/\.[^.]+$/, '')
}

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

interface RowData {
  tracks: MediaFile[]
  metaByName: Record<string, TrackMeta>
  currentName: string | null
  onPlay: (i: number) => void
}

function Row({ index, style, data }: ListChildComponentProps<RowData>): JSX.Element {
  const t = data.tracks[index]
  const meta = data.metaByName[t.name]
  const title = meta?.title || baseName(t.name)
  const sub = meta?.artist || meta?.album || ''
  return (
    <div style={style}>
      <button
        className={`track-row ${data.currentName === t.name ? 'active' : ''}`}
        onClick={() => data.onPlay(index)}
      >
        <span className="track-title">{title}</span>
        <span className="track-sub faint">{sub}</span>
        {meta?.durationSec != null && (
          <span className="track-dur faint">{fmtTime(meta.durationSec)}</span>
        )}
      </button>
    </div>
  )
}

export default function MusicPlayerCard({
  onSettings
}: {
  onSettings: () => void
}): JSX.Element {
  const [tracks, setTracks] = useState<MediaFile[]>([])
  const [metaByName, setMetaByName] = useState<Record<string, TrackMeta>>({})
  const [current, setCurrent] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState<'off' | 'one' | 'all'>('all')
  const [volume, setVolume] = useState(0.8)
  const [filter, setFilter] = useState('')
  const [genre, setGenre] = useState('all')
  const [pos, setPos] = useState(0)
  const [dur, setDur] = useState(0)
  const [vizIdx, setVizIdx] = useState(2) // radial-ish default
  const vizMode: VizMode = VIZ_MODES[vizIdx]

  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const listWrapRef = useRef<HTMLDivElement>(null)
  const [listH, setListH] = useState(200)
  const audioGraph = useRef<{ ctx: AudioContext; analyser: AnalyserNode } | null>(
    null
  )
  const rafRef = useRef<number | null>(null)
  const vizRef = useRef<Visualizer | null>(null)
  if (!vizRef.current) vizRef.current = new Visualizer()

  useEffect(() => {
    void window.api.dashboard.listMusic().then(setTracks)
  }, [])

  // Measure list height.
  useEffect(() => {
    const el = listWrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setListH(el.clientHeight))
    ro.observe(el)
    setListH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  // Visualizer loop.
  useEffect(() => {
    const loop = (): void => {
      const canvas = canvasRef.current
      const g = audioGraph.current
      if (canvas && g && playing) vizRef.current!.draw(vizMode, g.analyser, canvas)
      else if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [vizMode, playing])

  const ensureGraph = (): void => {
    const audio = audioRef.current
    if (!audio || audioGraph.current) return
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    const ctx = new Ctx()
    const source = ctx.createMediaElementSource(audio)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    analyser.connect(ctx.destination)
    audioGraph.current = { ctx, analyser }
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return tracks.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) {
        const m = metaByName[t.name]
        const hay = `${m?.title ?? ''} ${m?.artist ?? ''} ${m?.album ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (genre !== 'all') {
        const g = metaByName[t.name]?.genre
        if (!g || g.toLowerCase() !== genre.toLowerCase()) return false
      }
      return true
    })
  }, [tracks, filter, genre, metaByName])

  const genres = useMemo(() => {
    const set = new Set<string>()
    for (const m of Object.values(metaByName)) if (m.genre) set.add(m.genre)
    return Array.from(set).sort()
  }, [metaByName])

  const loadMeta = useCallback(
    async (name: string) => {
      if (metaByName[name]) return
      const meta = await window.api.dashboard.trackMeta(name)
      setMetaByName((prev) => ({ ...prev, [name]: meta }))
    },
    [metaByName]
  )

  const playIndexInFiltered = useCallback(
    async (i: number) => {
      const track = filtered[i]
      if (!track) return
      const globalIdx = tracks.findIndex((t) => t.name === track.name)
      setCurrent(globalIdx)
      const audio = audioRef.current!
      audio.src = track.url
      audio.volume = volume
      ensureGraph()
      if (audioGraph.current?.ctx.state === 'suspended') {
        await audioGraph.current.ctx.resume()
      }
      // Pause the persistent startup-music channel so they don't overlap.
      setChannel('music', { playing: false })
      try {
        await audio.play()
        setPlaying(true)
      } catch {
        /* gesture needed */
      }
      void loadMeta(track.name)
    },
    [filtered, tracks, volume, loadMeta]
  )

  const currentTrack = current != null ? tracks[current] : null
  const currentMeta = currentTrack ? metaByName[currentTrack.name] : undefined

  const nextTrack = useCallback(() => {
    if (filtered.length === 0) return
    const curName = currentTrack?.name
    const idxInFiltered = filtered.findIndex((t) => t.name === curName)
    let ni: number
    if (shuffle) ni = Math.floor(Math.random() * filtered.length)
    else ni = (idxInFiltered + 1) % filtered.length
    void playIndexInFiltered(ni)
  }, [filtered, currentTrack, shuffle, playIndexInFiltered])

  const prevTrack = useCallback(() => {
    if (filtered.length === 0) return
    const idxInFiltered = filtered.findIndex((t) => t.name === currentTrack?.name)
    const pi = (idxInFiltered - 1 + filtered.length) % filtered.length
    void playIndexInFiltered(pi)
  }, [filtered, currentTrack, playIndexInFiltered])

  const togglePlay = async (): Promise<void> => {
    const audio = audioRef.current!
    if (!currentTrack) {
      void playIndexInFiltered(0)
      return
    }
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      if (audioGraph.current?.ctx.state === 'suspended') {
        await audioGraph.current.ctx.resume()
      }
      await audio.play()
      setPlaying(true)
    }
  }

  const onEnded = (): void => {
    if (repeat === 'one' && currentTrack) {
      void playIndexInFiltered(filtered.findIndex((t) => t.name === currentTrack.name))
    } else {
      nextTrack()
    }
  }

  return (
    <Card
      title={`Player${tracks.length ? ` · ${tracks.length}` : ''}`}
      actions={
        <>
          <button
            className="hd-act"
            onClick={() => setVizIdx((i) => (i + 1) % VIZ_MODES.length)}
          >
            {vizMode}
          </button>
          {currentTrack && (
            <button
              className="hd-act"
              title="play this song at startup"
              onClick={() =>
                void window.api.settings.set({
                  musicAutostart: true,
                  musicTrack: currentTrack.url,
                  musicVolume: volume
                })
              }
            >
              ★ startup
            </button>
          )}
          <button className="hd-act" onClick={onSettings}>
            folder
          </button>
        </>
      }
    >
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDur(e.currentTarget.duration)}
        onEnded={onEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <canvas
        ref={canvasRef}
        className="player-vizbar"
        title="click to change visualizer"
        onClick={() => setVizIdx((i) => (i + 1) % VIZ_MODES.length)}
      />

      <div className="np">
        <div className="np-art">
          {currentMeta?.art ? (
            <img src={currentMeta.art} alt="" />
          ) : (
            <span className="np-art-ph">♪</span>
          )}
        </div>
        <div className="np-info">
          <div className="np-title">
            {currentTrack ? currentMeta?.title || baseName(currentTrack.name) : '—'}
          </div>
          <div className="np-sub faint">
            {currentMeta?.artist || ''}
            {currentMeta?.album ? ` — ${currentMeta.album}` : ''}
          </div>
          <div className="np-seek">
            <span className="faint">{fmtTime(pos)}</span>
            <input
              type="range"
              min={0}
              max={dur || 0}
              step={0.1}
              value={pos}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (audioRef.current) audioRef.current.currentTime = v
                setPos(v)
              }}
            />
            <span className="faint">{fmtTime(dur)}</span>
          </div>
          <div className="np-transport">
            <button className="tp-btn" onClick={prevTrack} title="previous">
              ⏮
            </button>
            <button className="tp-btn tp-play" onClick={togglePlay}>
              {playing ? '❚❚' : '▶'}
            </button>
            <button className="tp-btn" onClick={nextTrack} title="next">
              ⏭
            </button>
            <button
              className={`tp-btn ${shuffle ? 'on' : ''}`}
              onClick={() => setShuffle((v) => !v)}
              title="shuffle"
            >
              ⤨
            </button>
            <button
              className={`tp-btn ${repeat !== 'off' ? 'on' : ''}`}
              onClick={() =>
                setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'))
              }
              title={`repeat: ${repeat}`}
            >
              {repeat === 'one' ? '🔂' : '🔁'}
            </button>
            <input
              className="np-vol"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value)
                setVolume(v)
                if (audioRef.current) audioRef.current.volume = v
              }}
            />
          </div>
        </div>
      </div>

      <div className="lib-filter">
        <input
          value={filter}
          placeholder="filter: title / artist / album…"
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={genre} onChange={(e) => setGenre(e.target.value)}>
          <option value="all">Genre</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div className="lib-list" ref={listWrapRef}>
        {tracks.length === 0 ? (
          <div className="faint dash-empty">
            no music found — set your Music folder
          </div>
        ) : (
          <List
            height={Math.max(80, listH)}
            width="100%"
            itemCount={filtered.length}
            itemSize={34}
            itemData={{
              tracks: filtered,
              metaByName,
              currentName: currentTrack?.name ?? null,
              onPlay: (i: number) => void playIndexInFiltered(i)
            }}
          >
            {Row}
          </List>
        )}
      </div>
    </Card>
  )
}
