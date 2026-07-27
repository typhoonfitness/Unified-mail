import type { ReactNode } from 'react'

export type CardStatus = 'ok' | 'err' | 'busy' | 'none'

interface Props {
  title: ReactNode
  status?: CardStatus
  actions?: ReactNode
  className?: string
  children: ReactNode
}

// A Start-Page-style card: bordered panel with a tiny uppercase glow header,
// optional action links, and a status dot.
export default function Card({
  title,
  status = 'none',
  actions,
  className,
  children
}: Props): JSX.Element {
  return (
    <section className={`dash-card ${className ?? ''}`}>
      <h3 className="dash-card-h3">
        <span className="dash-card-title">{title}</span>
        <span className="head-actions">
          {actions}
          {status !== 'none' && <span className={`status-dot ${status}`} />}
        </span>
      </h3>
      <div className="dash-card-body">{children}</div>
    </section>
  )
}
