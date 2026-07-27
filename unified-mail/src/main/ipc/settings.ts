// Settings IPC. Applies side effects for settings that affect the main process:
// auto-launch, background sync frequency, and theme (broadcast to the renderer).

import { ipcMain, app, BrowserWindow } from 'electron'
import type { AppSettings } from '@shared/types'
import { getSettings, setSettings } from '../settings/settingsStore'
import { setSyncInterval } from '../sync/engine'

function applyAutoLaunch(enabled: boolean): void {
  // openAtLogin is honored on macOS and Windows; a no-op elsewhere.
  app.setLoginItemSettings({ openAtLogin: enabled })
}

function broadcast(settings: AppSettings): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:changed', settings)
  }
}

// Apply everything that has an effect outside the DB. Called on set + at startup.
export function applySettings(settings: AppSettings): void {
  applyAutoLaunch(settings.autoLaunch)
  setSyncInterval(settings.syncSeconds)
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle(
    'settings:set',
    async (_e, partial: Partial<AppSettings>): Promise<AppSettings> => {
      const merged = setSettings(partial)
      applySettings(merged)
      broadcast(merged)
      return merged
    }
  )
}
