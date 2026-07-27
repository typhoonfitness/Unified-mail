import type {
  ExposedApi,
  SyncStatus,
  OutboxItem,
  AppSettings
} from '../shared/types'

export interface ExposedEvents {
  onSyncStatus: (cb: (statuses: SyncStatus[]) => void) => () => void
  onOutbox: (cb: (items: OutboxItem[]) => void) => () => void
  onMailChanged: (cb: () => void) => () => void
  onSettingsChanged: (cb: (settings: AppSettings) => void) => () => void
}

declare global {
  interface Window {
    api: ExposedApi
    events: ExposedEvents
  }
}

export {}
