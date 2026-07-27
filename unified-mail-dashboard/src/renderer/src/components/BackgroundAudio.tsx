import { useEffect, useRef } from 'react'
import { useAudioBus, setChannel } from '../lib/audioBus'

// Persistent (app-level) audio for the ambient + music channels. Mounted once
// at the root so playback continues across dashboard/mail view switches.
export default function BackgroundAudio(): JSX.Element {
  const state = useAudioBus()
  const ambientRef = useRef<HTMLAudioElement>(null)
  const musicRef = useRef<HTMLAudioElement>(null)

  // Apply channel state to the <audio> elements.
  const sync = (
    el: HTMLAudioElement | null,
    ch: { url: string | null; playing: boolean; volume: number }
  ): void => {
    if (!el) return
    el.volume = ch.volume
    if (ch.url && el.getAttribute('src') !== ch.url) el.src = ch.url
    if (ch.url && ch.playing) {
      el.play().catch(() => {
        /* blocked until a gesture; handled below */
      })
    } else {
      el.pause()
    }
  }

  useEffect(() => sync(ambientRef.current, state.ambient), [state.ambient])
  useEffect(() => sync(musicRef.current, state.music), [state.music])

  // Autostart from settings; actual playback may wait for the first user gesture.
  useEffect(() => {
    void window.api.settings.get().then((s) => {
      if (s.ambientAutostart && s.ambientTrack) {
        setChannel('ambient', {
          url: s.ambientTrack,
          playing: true,
          volume: s.ambientVolume
        })
      }
      if (s.musicAutostart && s.musicTrack) {
        setChannel('music', {
          url: s.musicTrack,
          playing: true,
          volume: s.musicVolume
        })
      }
    })
  }, [])

  // Browsers block autoplay until interaction: resume any channel that wants to
  // play on the first user gesture.
  useEffect(() => {
    const resume = (): void => {
      const s = state
      if (s.ambient.playing) ambientRef.current?.play().catch(() => {})
      if (s.music.playing) musicRef.current?.play().catch(() => {})
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [state])

  return (
    <>
      <audio ref={ambientRef} loop />
      <audio ref={musicRef} loop />
    </>
  )
}
