// IPC handlers for the auth surface. The renderer never touches tokens or the
// OAuth flow directly; it only invokes these channels through the preload
// bridge. Errors are returned as data (never thrown across the IPC boundary).

import { ipcMain } from 'electron'
import type { Provider, ConnectResult } from '@shared/types'
import {
  connectAccount,
  disconnectAccount,
  listConnectedAccounts
} from '../auth/session'
import { onAccountConnected } from '../sync/engine'

export function registerAuthIpc(): void {
  ipcMain.handle(
    'auth:connect',
    async (_e, provider: Provider): Promise<ConnectResult> => {
      try {
        const account = await connectAccount(provider)
        // Kick off the initial full sync in the background.
        onAccountConnected(account.id)
        return { ok: true, account }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle(
    'auth:disconnect',
    async (_e, accountId: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        disconnectAccount(accountId)
        return { ok: true }
      } catch (err) {
        return { ok: false, error: (err as Error).message }
      }
    }
  )

  ipcMain.handle('auth:listAccounts', async () => {
    return listConnectedAccounts()
  })
}
