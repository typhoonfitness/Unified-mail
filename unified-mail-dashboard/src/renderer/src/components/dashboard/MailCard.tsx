import { useCallback, useEffect, useState } from 'react'
import type { ThreadSummary } from '../../../../shared/types'
import Card, { type CardStatus } from './Card'
import { relativeTime, displayName } from '../../lib/format'

interface Props {
  onOpenMail: (threadId?: string) => void
}

// A compact inbox card: recent unread threads. Clicking opens the full mail
// view (optionally jumping straight to the thread).
export default function MailCard({ onOpenMail }: Props): JSX.Element {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [status, setStatus] = useState<CardStatus>('busy')

  const load = useCallback(async () => {
    // Show recent inbox mail (read + unread), not only unread.
    const list = await window.api.mail.listThreads({
      folder: 'inbox',
      limit: 20
    })
    setThreads(list)
    setStatus('ok')
  }, [])

  useEffect(() => {
    void load()
    const unsub = window.events.onSyncStatus(() => void load())
    const unsub2 = window.events.onMailChanged(() => void load())
    return () => {
      unsub()
      unsub2()
    }
  }, [load])

  const unread = threads.filter((t) => t.unreadCount > 0).length

  return (
    <Card
      title={`Mail${unread ? ` · ${unread} unread` : ''}`}
      status={status}
      className="dash-card--mail"
      actions={
        <button className="hd-act" onClick={() => onOpenMail()}>
          open
        </button>
      }
    >
      {threads.length === 0 ? (
        <div className="faint dash-empty">inbox zero ✓</div>
      ) : (
        <div className="mailcard-list">
          {threads.map((t) => (
            <button
              className={`mailcard-row ${t.unreadCount > 0 ? 'unread' : ''}`}
              key={t.id}
              onClick={() => onOpenMail(t.id)}
            >
              <span className="mailcard-top">
                {t.providers.map((p) => (
                  <span key={p} className={`badge ${p}`}>
                    {p === 'google' ? 'G' : 'O'}
                  </span>
                ))}
                <span className="mailcard-sender">
                  {t.participants.length
                    ? displayName(t.participants[0])
                    : '(unknown)'}
                </span>
                <span className="mailcard-time">
                  {relativeTime(t.lastMessageAt)}
                </span>
              </span>
              <span className="mailcard-subject">
                {t.subject || '(no subject)'}
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}
