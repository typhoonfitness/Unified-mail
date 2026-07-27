import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, ConnectedAccount, Theme } from '../../shared/types'
import ConnectScreen from './components/ConnectScreen'
import Inbox from './components/Inbox'

type View = 'loading' | 'connect' | 'inbox'

function applyTheme(theme: Theme): void {
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme
  document.body.classList.toggle('light', resolved === 'light')
}

// Apply phosphor color + CRT effect toggles as body classes.
function applyEffects(s: AppSettings): void {
  const body = document.body
  for (const p of ['green', 'amber', 'ice', 'red']) {
    body.classList.toggle(`phos-${p}`, s.phosphor === p)
  }
  const fx = s.effects
  body.classList.toggle('no-scan', !fx.scanlines)
  body.classList.toggle('no-glow', !fx.glow)
  body.classList.toggle('flicker', fx.flicker)
  body.classList.toggle('grain', fx.grain)
  body.classList.toggle('fx-glitch', fx.glitch)
  body.classList.toggle('fx-chromatic', fx.chromatic)
  body.classList.toggle('fx-pulse', fx.pulse)
}

const FONT_STACKS: Record<string, string> = {
  'Courier Prime': "'Courier Prime','Courier New',monospace",
  'Special Elite': "'Special Elite','Courier Prime',monospace",
  VT323: "'VT323',monospace",
  'Share Tech Mono': "'Share Tech Mono',monospace",
  'JetBrains Mono': "'JetBrains Mono',monospace",
  'IBM Plex Mono': "'IBM Plex Mono',monospace",
  'System mono': 'ui-monospace,Menlo,Consolas,monospace',
  'Times New Roman': "'Times New Roman',Times,serif",
  Georgia: 'Georgia,serif',
  'EB Garamond': "'EB Garamond',Georgia,serif",
  Arial: 'Arial,Helvetica,sans-serif',
  'System sans': 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
}

function applyFont(s: AppSettings): void {
  const stack = FONT_STACKS[s.font] ?? FONT_STACKS['Courier Prime']
  document.documentElement.style.setProperty('--mono', stack)
  // Size control via CSS zoom scales every px uniformly.
  ;(document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(
    (s.fontScale || 100) / 100
  )
}

function applyVisual(s: AppSettings): void {
  applyTheme(s.theme)
  applyEffects(s)
  applyFont(s)
}

export const FONT_OPTIONS = Object.keys(FONT_STACKS)

export default function App(): JSX.Element {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([])
  const [view, setView] = useState<View>('loading')
  const [fatal, setFatal] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!window.api?.auth) {
      setFatal(
        'Preload bridge (window.api) is unavailable — the preload script did not load.'
      )
      return
    }
    try {
      const list = await window.api.auth.listAccounts()
      setAccounts(list)
      setView((prev) => {
        if (prev === 'loading') return list.length > 0 ? 'inbox' : 'connect'
        if (list.length === 0) return 'connect'
        return prev
      })
    } catch (err) {
      setFatal(`Failed to load accounts: ${(err as Error).message}`)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Apply and track theme + CRT effects.
  useEffect(() => {
    void window.api.settings.get().then(applyVisual)
    return window.events.onSettingsChanged(applyVisual)
  }, [])

  if (fatal) {
    return (
      <div style={{ padding: 24, fontFamily: 'monospace' }}>
        <div
          style={{
            color: '#e08a8a',
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 8
          }}
        >
          ! startup error
        </div>
        <div style={{ color: '#e8e8ea' }}>{fatal}</div>
      </div>
    )
  }

  if (view === 'loading') {
    return (
      <div
        className="connect-screen"
        style={{
          color: '#8a8a90',
          letterSpacing: 3,
          textTransform: 'uppercase',
          fontSize: 12
        }}
      >
        loading…
      </div>
    )
  }

  if (view === 'connect') {
    return (
      <ConnectScreen
        accounts={accounts}
        onChanged={load}
        onDone={accounts.length > 0 ? () => setView('inbox') : undefined}
      />
    )
  }

  return (
    <Inbox
      accounts={accounts}
      onManageAccounts={() => setView('connect')}
      onReloadAccounts={load}
    />
  )
}
