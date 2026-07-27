// Electron main process entry point.

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { getDb, closeDb } from './db'
import { pruneEmptyMessages } from './sync/store'
import { registerAuthIpc } from './ipc/auth'
import { registerMailIpc } from './ipc/mail'
import { registerComposeIpc } from './ipc/compose'
import { registerSnippetsIpc } from './ipc/snippets'
import { registerSettingsIpc, applySettings } from './ipc/settings'
import { registerAiIpc } from './ipc/ai'
import { startScheduler, stopScheduler } from './sync/engine'
import { startOutbox, stopOutbox } from './compose/outbox'
import {
  startSnoozeScheduler,
  stopSnoozeScheduler
} from './sync/snoozeScheduler'
import {
  startFollowUpScheduler,
  stopFollowUpScheduler
} from './sync/followup'
import { createTray, destroyTray } from './ui/tray'
import { getSettings } from './settings/settingsStore'
import { appIconPath } from './ui/appIcon'

// App identity: shows "Unified Mail" (not "Electron") in the taskbar,
// window title, and Windows notifications.
app.setName('Unified Mail')
if (process.platform === 'win32') app.setAppUserModelId('com.unifiedmail.app')
import {
  installAppMenu,
  installContextMenu,
  registerClipboardIpc
} from './ui/appMenu'

const isDev = !app.isPackaged

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Unified Mail',
    icon: appIconPath(),
    backgroundColor: '#0b0b0f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      // Security posture required by Prompt 1:
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // preload needs Node to use the ipcRenderer bridge
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Right-click Cut/Copy/Paste/Select All in any field.
  installContextMenu(mainWindow)

  // Open external links (e.g. from rendered email) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only open safe web links externally (email links, quick links, etc.).
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block in-page navigations away from the app (e.g. a link trying to replace
  // the whole window); send them to the browser instead.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Initialize the local database up front so the first IPC call is fast.
  getDb()
  // Clean up any empty placeholder messages from earlier syncs.
  pruneEmptyMessages()
  registerAuthIpc()
  registerMailIpc()
  registerComposeIpc()
  registerSnippetsIpc()
  registerSettingsIpc()
  registerAiIpc()
  registerClipboardIpc()

  // Standard Edit menu so Cmd/Ctrl+C/V/X/A/Z work app-wide.
  installAppMenu()

  createWindow()
  createTray()

  // Apply saved settings (auto-launch, sync frequency) at startup.
  applySettings(getSettings())

  // Begin background sync (full on first connect, incremental per settings).
  startScheduler()
  // Resume/process the local send queue.
  startOutbox()
  // Re-surface snoozed threads when their time passes.
  startSnoozeScheduler()
  // Fire follow-up reminders when replies don't arrive in time.
  startFollowUpScheduler()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopScheduler()
    stopOutbox()
    stopSnoozeScheduler()
    destroyTray()
    closeDb()
    app.quit()
  }
})

app.on('before-quit', () => {
  stopScheduler()
  stopOutbox()
  stopSnoozeScheduler()
  stopFollowUpScheduler()
  destroyTray()
  closeDb()
})
