import { useSyncExternalStore } from 'react'

// A tiny global store for background audio, so playback survives view changes
// (e.g. the screensaver's ambient sound keeps playing when you open the mail
// tab). Two channels: 'ambient' (screensaver) and 'music' (startup/player).

export interface Channel {
  url: string | null
  label?: string
  playing: boolean
  volume: number
}

export interface AudioState {
  ambient: Channel
  music: Channel
}

let state: AudioState = {
  ambient: { url: null, playing: false, volume: 0.5 },
  music: { url: null, playing: false, volume: 0.8 }
}

const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

export function setChannel(
  name: keyof AudioState,
  patch: Partial<Channel>
): void {
  state = { ...state, [name]: { ...state[name], ...patch } }
  emit()
}

export function getAudioState(): AudioState {
  return state
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useAudioBus(): AudioState {
  return useSyncExternalStore(subscribe, getAudioState, getAudioState)
}
