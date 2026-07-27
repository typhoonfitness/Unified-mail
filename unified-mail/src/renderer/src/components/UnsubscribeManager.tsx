import { useEffect, useState } from 'react'
import type { BulkSender } from '../../../shared/types'

interface Props {
  onClose: () => void
  onChanged: () => void // refresh threads after archiving
}

export default function UnsubscribeManager({
  onClose,
  onChanged
}: Props): JSX.Element {
  const [senders, setSenders] = useState<BulkSender[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})

  const load = async (): Promise<void> => {
    const list = await window.api.mail.listBulkSenders()
    setSenders(list)
  }
  useEffect(() => {
    void load()
  }, [])

  const unsub = async (s: BulkSender): Promise<void> => {
    setBusy(s.fromEmail)
    const res = await window.api.mail.unsubscribeSender(s.fromEmail)
    setBusy(null)
    if (res.ok) {
      setDone((d) => ({
        ...d,
        [s.fromEmail]: res.opened
          ? `Unsubscribe opened · archived ${res.archived}`
          : `No 1-click link · archived ${res.archived}`
      }))
      onChanged()
      void load()
    } else {
      setDone((d) => ({ ...d, [s.fromEmail]: res.error ?? 'Failed' }))
    }
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div
        className="settings wide"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="settings-head">
          <span>Unsubscribe manager</span>
          <button className="hd-act" onClick={onClose}>
            close
          </button>
        </div>
        <div className="settings-body">
          {!senders && <div className="faint">scanning inbox…</div>}
          {senders && senders.length === 0 && (
            <div className="faint">
              No newsletters or marketing senders in your inbox. Nice and clean.
            </div>
          )}
          {senders && senders.length > 0 && (
            <table className="unsub-table">
              <thead>
                <tr>
                  <th>Sender</th>
                  <th>Emails</th>
                  <th>Unsub</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {senders.map((s) => (
                  <tr key={s.fromEmail}>
                    <td>
                      <div className="unsub-name">
                        {s.fromName || s.fromEmail}
                      </div>
                      <div className="faint unsub-email">{s.fromEmail}</div>
                    </td>
                    <td className="unsub-count">{s.count}</td>
                    <td>
                      {s.unsubscribeUrl || s.unsubscribeMailto ? (
                        <span className="ok-dot" title="1-click available">
                          ●
                        </span>
                      ) : (
                        <span className="faint" title="no header link">
                          —
                        </span>
                      )}
                    </td>
                    <td>
                      {done[s.fromEmail] ? (
                        <span className="faint">{done[s.fromEmail]}</span>
                      ) : (
                        <button
                          className="tbtn"
                          disabled={busy === s.fromEmail}
                          onClick={() => unsub(s)}
                        >
                          {busy === s.fromEmail
                            ? 'working…'
                            : 'Unsubscribe + archive'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="settings-foot faint">
          Opens the sender's unsubscribe link in your browser and archives their
          messages from your inbox. Some senders don't provide a link.
        </div>
      </div>
    </div>
  )
}
