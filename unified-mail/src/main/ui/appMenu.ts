// Application menu (with standard Edit roles so Cmd/Ctrl+C/V/X/A work
// everywhere) and a right-click context menu offering Cut/Copy/Paste/Select
// All in any text field. This is what makes copy/paste work app-wide.

import { app, Menu, BrowserWindow, clipboard, ipcMain } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'

export function installAppMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }]
      : []),
    { role: 'fileMenu' },
    {
      role: 'editMenu' // includes undo/redo/cut/copy/paste/selectAll + accelerators
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// Right-click context menu with clipboard actions, shown on any web contents.
export function installContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_e, params) => {
    const canPaste = params.isEditable
    const hasSelection = params.selectionText.trim().length > 0
    const items: MenuItemConstructorOptions[] = [
      { role: 'cut', enabled: canPaste && hasSelection },
      { role: 'copy', enabled: hasSelection },
      { role: 'paste', enabled: canPaste },
      { type: 'separator' },
      { role: 'selectAll' }
    ]
    Menu.buildFromTemplate(items).popup({ window: win })
  })
}

// Clipboard read/write IPC (for "paste" buttons on URL fields, etc.).
export function registerClipboardIpc(): void {
  ipcMain.handle('app:clipboardRead', () => clipboard.readText())
  ipcMain.handle('app:clipboardWrite', (_e, text: string) => {
    clipboard.writeText(text)
    return true
  })
  // Reference app so the import isn't flagged unused in some builds.
  void app
}
