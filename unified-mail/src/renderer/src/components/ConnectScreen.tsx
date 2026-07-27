import { useState } from 'react'
import type { ConnectedAccount, Provider } from '../../../shared/types'

interface Props {
  accounts: ConnectedAccount[]
  onChanged: () => void
  onDone?: () => void
}

type Status =
  | { kind: 'idle' }
  | { kind: 'connecting'; provider: Provider }
  | { kind: 'error'; message: string }

export default function ConnectScreen({
  accounts,
  onChanged,
  onDone
}: Props): JSX.Element {
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const connect = async (provider: Provider): Promise<void> => {
    setStatus({ kind: 'connecting', provider })
    const res = await window.api.auth.connect(provider)
    if (res.ok) {
      setStatus({ kind: 'idle' })
      onChanged()
    } else {
      setStatus({ kind: 'error', message: res.error ?? 'Unknown error' })
    }
  }

  const disconnect = async (id: string): Promise<void> => {
    await window.api.auth.disconnect(id)
    onChanged()
  }

  const gmail = accounts.find((a) => a.provider === 'google')
  const outlook = accounts.find((a) => a.provider === 'microsoft')

  return (
    <div className="connect-screen">
      <div className="connect-inner">
        <h1>UNIFIED MAIL</h1>
        <div className="sub">// terminal mail client — connect accounts</div>

        <Card
          title="Gmail"
          provider="google"
          badge="G"
          account={gmail}
          connecting={status.kind === 'connecting' && status.provider === 'google'}
          onConnect={() => connect('google')}
          onDisconnect={disconnect}
        />
        <Card
          title="Outlook"
          provider="microsoft"
          badge="O"
          account={outlook}
          connecting={
            status.kind === 'connecting' && status.provider === 'microsoft'
          }
          onConnect={() => connect('microsoft')}
          onDisconnect={disconnect}
        />

        {status.kind === 'error' && <div className="err">! {status.message}</div>}

        {accounts.length > 0 && onDone && (
          <div style={{ marginTop: 18, textAlign: 'right' }}>
            <button className="link-btn" onClick={onDone}>
              enter inbox →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface CardProps {
  title: string
  provider: Provider
  badge: string
  account?: ConnectedAccount
  connecting: boolean
  onConnect: () => void
  onDisconnect: (id: string) => void
}

function Card({
  title,
  provider,
  badge,
  account,
  connecting,
  onConnect,
  onDisconnect
}: CardProps): JSX.Element {
  const connected = Boolean(account)
  return (
    <div className={`card ${connected ? 'connected' : ''}`}>
      <div className={`cbadge ${provider}`}>{badge}</div>
      <div className="cbody">
        <h2>{title}</h2>
        {connected ? (
          <div className="email">{account!.email}</div>
        ) : (
          <div className="state faint">not connected</div>
        )}
      </div>
      {connected ? (
        <button className="btn ghost" onClick={() => onDisconnect(account!.id)}>
          Disconnect
        </button>
      ) : (
        <button className="btn" onClick={onConnect} disabled={connecting}>
          {connecting ? 'Connecting…' : `Connect`}
        </button>
      )}
    </div>
  )
}
