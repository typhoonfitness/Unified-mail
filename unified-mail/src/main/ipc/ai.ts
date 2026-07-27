// IPC for the optional AI helpers (summarize thread / draft reply).

import { ipcMain } from 'electron'
import type { AiResult, DigestRange } from '@shared/types'
import { getThread, getMessageById, messagesForDigest } from '../sync/store'
import { summarizeThread, draftReply, summarizeDigest } from '../ai/aiClient'

const RANGE_LABEL: Record<DigestRange, string> = {
  today: 'today',
  week: 'the last 7 days',
  month: 'the last 30 days',
  unread: 'your unread inbox'
}

export function registerAiIpc(): void {
  ipcMain.handle(
    'ai:summarize',
    async (_e, threadId: string): Promise<AiResult> => {
      const thread = getThread(threadId)
      if (!thread) return { ok: false, error: 'Thread not found.' }
      return summarizeThread(thread)
    }
  )

  // messageId is the message being replied to; we resolve its thread for context.
  ipcMain.handle(
    'ai:draftReply',
    async (_e, messageId: string, instructions: string): Promise<AiResult> => {
      const msg = getMessageById(messageId)
      const thread = msg ? getThread(msg.unifiedThreadId) : null
      if (!thread) return { ok: false, error: 'Message not found.' }
      return draftReply(thread, instructions ?? '')
    }
  )

  ipcMain.handle(
    'ai:digest',
    async (_e, range: DigestRange): Promise<AiResult> => {
      const msgs = messagesForDigest(range)
      return summarizeDigest(msgs, RANGE_LABEL[range] ?? range)
    }
  )
}
