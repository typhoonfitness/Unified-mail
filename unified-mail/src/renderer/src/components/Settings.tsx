import { useEffect, useState } from 'react'
import type {
  AppSettings,
  ConnectedAccount,
  CrtEffects,
  MailRule,
  Phosphor,
  Provider,
  Signature,
  Theme
} from '../../../shared/types'

const ACTION_LABEL: Record<MailRule['action'], string> = {
  skipInbox: 'skip inbox',
  markRead: 'mark read',
  star: 'star',
  trash: 'trash'
}

const FONT_LIST = [
  'Courier Prime',
  'Special Elite',
  'VT323',
  'Share Tech Mono',
  'JetBrains Mono',
  'IBM Plex Mono',
  'System mono',
  'Times New Roman',
  'Georgia',
  'EB Garamond',
  'Arial',
  'System sans'
]

interface Props {
  accounts: ConnectedAccount[]
  onAccountsChanged: () => void
  onClose: () => void
}

export default function Settings({
  accounts,
  onAccountsChanged,
  onClose
}: Props): JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [connecting, setConnecting] = useState<Provider | null>(null)
  const [ruleDraft, setRuleDraft] = useState<Omit<MailRule, 'id'>>({
    name: '',
    enabled: true,
    field: 'from',
    value: '',
    action: 'skipInbox'
  })
  const [sigDraft, setSigDraft] = useState<Omit<Signature, 'id'>>({
    name: '',
    html: '',
    accountId: null,
    isDefault: false
  })

  useEffect(() => {
    void window.api.settings.get().then(setSettings)
  }, [])

  const update = async (partial: Partial<AppSettings>): Promise<void> => {
    const next = await window.api.settings.set(partial)
    setSettings(next)
  }

  const connect = async (provider: Provider): Promise<void> => {
    setConnecting(provider)
    await window.api.auth.connect(provider)
    setConnecting(null)
    onAccountsChanged()
  }

  const disconnect = async (id: string): Promise<void> => {
    await window.api.auth.disconnect(id)
    onAccountsChanged()
  }

  if (!settings) {
    return (
      <div className="palette-overlay" onMouseDown={onClose}>
        <div className="settings" onMouseDown={(e) => e.stopPropagation()}>
          <div className="settings-body faint">loading…</div>
        </div>
      </div>
    )
  }

  return (
    <div className="palette-overlay" onMouseDown={onClose}>
      <div className="settings" onMouseDown={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <span>Settings</span>
          <span className="spacer" />
          <button className="link-btn" onClick={onClose}>
            close
          </button>
        </div>

        <div className="settings-body">
          <Section title="Accounts">
            {accounts.length === 0 && (
              <div className="faint" style={{ fontSize: 12 }}>
                no accounts connected
              </div>
            )}
            {accounts.map((a) => (
              <div className="set-account" key={a.id}>
                <span className={`badge ${a.provider}`}>
                  {a.provider === 'google' ? 'G' : 'O'}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="set-email">{a.email}</div>
                  <textarea
                    className="set-sig"
                    placeholder="Signature (HTML or text)…"
                    value={settings.signatures[a.id] ?? ''}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        signatures: {
                          ...settings.signatures,
                          [a.id]: e.target.value
                        }
                      })
                    }
                    onBlur={() =>
                      update({
                        signatures: {
                          [a.id]: settings.signatures[a.id] ?? ''
                        }
                      })
                    }
                    rows={2}
                  />
                </div>
                <button className="link-btn" onClick={() => disconnect(a.id)}>
                  remove
                </button>
              </div>
            ))}
            <div className="set-add">
              <button
                className="btn"
                disabled={connecting === 'google'}
                onClick={() => connect('google')}
              >
                {connecting === 'google' ? '…' : '+ Gmail'}
              </button>
              <button
                className="btn"
                disabled={connecting === 'microsoft'}
                onClick={() => connect('microsoft')}
              >
                {connecting === 'microsoft' ? '…' : '+ Outlook'}
              </button>
            </div>
          </Section>

          <Section title="Notifications">
            <Toggle
              label="Desktop notifications for new mail"
              checked={settings.notifications}
              onChange={(v) => update({ notifications: v })}
            />
            <Toggle
              label="Do not disturb (mute notifications)"
              checked={settings.doNotDisturb}
              onChange={(v) => update({ doNotDisturb: v })}
            />
          </Section>

          <Section title="Reading">
            <Toggle
              label="Load remote images automatically"
              checked={settings.autoLoadImages}
              onChange={(v) => update({ autoLoadImages: v })}
            />
          </Section>

          <Section title="Sync">
            <label className="set-row">
              <span>Check for mail every</span>
              <select
                value={settings.syncSeconds}
                onChange={(e) => update({ syncSeconds: Number(e.target.value) })}
              >
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
                <option value={900}>15 minutes</option>
              </select>
            </label>
          </Section>

          <Section title="Sending">
            <label className="set-row">
              <span>Undo Send window</span>
              <select
                value={settings.undoSendSeconds}
                onChange={(e) =>
                  update({ undoSendSeconds: Number(e.target.value) })
                }
              >
                <option value={0}>Off (send immediately)</option>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
              </select>
            </label>
          </Section>

          <Section title="AI">
            <label className="set-row">
              <span>Provider</span>
              <select
                value={settings.aiProvider}
                onChange={(e) =>
                  update({
                    aiProvider: e.target
                      .value as AppSettings['aiProvider']
                  })
                }
              >
                <option value="none">Off</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="openai">OpenAI</option>
                <option value="azure">Azure OpenAI / custom endpoint</option>
              </select>
            </label>
            {settings.aiProvider !== 'none' && (
              <>
                {settings.aiProvider === 'azure' && (
                  <label className="set-row">
                    <span>Endpoint URL</span>
                    <input
                      placeholder="https://your-res.openai.azure.com"
                      value={settings.aiBaseUrl}
                      onChange={(e) => update({ aiBaseUrl: e.target.value })}
                    />
                  </label>
                )}
                <label className="set-row">
                  <span>API key</span>
                  <input
                    type="password"
                    placeholder={
                      settings.aiProvider === 'anthropic'
                        ? 'sk-ant-…'
                        : settings.aiProvider === 'azure'
                          ? 'azure api key'
                          : 'sk-…'
                    }
                    value={settings.aiApiKey}
                    onChange={(e) => update({ aiApiKey: e.target.value })}
                  />
                </label>
                <label className="set-row">
                  <span>
                    {settings.aiProvider === 'azure'
                      ? 'Deployment'
                      : 'Model (optional)'}
                  </span>
                  <input
                    placeholder={
                      settings.aiProvider === 'anthropic'
                        ? 'claude-3-5-haiku-latest'
                        : settings.aiProvider === 'azure'
                          ? 'your-deployment-name'
                          : 'gpt-4o-mini'
                    }
                    value={settings.aiModel}
                    onChange={(e) => update({ aiModel: e.target.value })}
                  />
                </label>
                <div className="set-row faint" style={{ fontSize: 11 }}>
                  Powers “✦ Summarize”, “✦ AI draft”, and the AI digest. Your key
                  is stored locally and only sent to the provider you pick. For
                  Azure, paste your resource endpoint and deployment name.
                </div>
              </>
            )}
          </Section>

          <Section title="Auto-triage rules">
            {settings.rules.length === 0 && (
              <div className="faint set-row">
                No rules yet. New mail matching a rule is handled automatically.
              </div>
            )}
            {settings.rules.map((r) => (
              <div className="rule-row" key={r.id}>
                <input
                  type="checkbox"
                  checked={r.enabled}
                  onChange={(e) =>
                    update({
                      rules: settings.rules.map((x) =>
                        x.id === r.id ? { ...x, enabled: e.target.checked } : x
                      )
                    })
                  }
                />
                <span className="rule-desc">
                  <b>{r.name || '(rule)'}</b> · if {r.field} {r.field === 'category' ? 'is' : 'contains'}{' '}
                  “{r.value}” → {ACTION_LABEL[r.action]}
                </span>
                <button
                  className="hd-act"
                  onClick={() =>
                    update({ rules: settings.rules.filter((x) => x.id !== r.id) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <div className="rule-form">
              <input
                placeholder="rule name"
                value={ruleDraft.name}
                onChange={(e) =>
                  setRuleDraft({ ...ruleDraft, name: e.target.value })
                }
              />
              <select
                value={ruleDraft.field}
                onChange={(e) =>
                  setRuleDraft({
                    ...ruleDraft,
                    field: e.target.value as MailRule['field'],
                    value: ''
                  })
                }
              >
                <option value="from">From</option>
                <option value="subject">Subject</option>
                <option value="category">Category</option>
              </select>
              {ruleDraft.field === 'category' ? (
                <select
                  value={ruleDraft.value}
                  onChange={(e) =>
                    setRuleDraft({ ...ruleDraft, value: e.target.value })
                  }
                >
                  <option value="">choose…</option>
                  <option value="promotions">Promotions</option>
                  <option value="social">Social</option>
                  <option value="news">News</option>
                  <option value="accounts">Account alerts</option>
                  <option value="bulk">Bulk / newsletters</option>
                </select>
              ) : (
                <input
                  placeholder="contains…"
                  value={ruleDraft.value}
                  onChange={(e) =>
                    setRuleDraft({ ...ruleDraft, value: e.target.value })
                  }
                />
              )}
              <select
                value={ruleDraft.action}
                onChange={(e) =>
                  setRuleDraft({
                    ...ruleDraft,
                    action: e.target.value as MailRule['action']
                  })
                }
              >
                <option value="skipInbox">Skip inbox (archive + read)</option>
                <option value="markRead">Mark read</option>
                <option value="star">Star</option>
                <option value="trash">Trash</option>
              </select>
              <button
                className="tbtn"
                disabled={!ruleDraft.value.trim()}
                onClick={() => {
                  void update({
                    rules: [
                      ...settings.rules,
                      { ...ruleDraft, id: crypto.randomUUID() }
                    ]
                  })
                  setRuleDraft({
                    name: '',
                    enabled: true,
                    field: 'from',
                    value: '',
                    action: 'skipInbox'
                  })
                }}
              >
                Add rule
              </button>
            </div>
          </Section>

          <Section title="Signatures">
            {settings.signatureList.map((s) => (
              <div className="rule-row" key={s.id}>
                <span className="rule-desc">
                  <b>{s.name || '(signature)'}</b>
                  {s.isDefault ? ' · default' : ''} ·{' '}
                  {s.accountId
                    ? (accounts.find((a) => a.id === s.accountId)?.email ??
                      s.accountId)
                    : 'all accounts'}
                </span>
                {!s.isDefault && (
                  <button
                    className="hd-act"
                    title="make default"
                    onClick={() =>
                      update({
                        signatureList: settings.signatureList.map((x) => ({
                          ...x,
                          isDefault: x.id === s.id
                        }))
                      })
                    }
                  >
                    ★
                  </button>
                )}
                <button
                  className="hd-act"
                  onClick={() =>
                    update({
                      signatureList: settings.signatureList.filter(
                        (x) => x.id !== s.id
                      )
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <div className="rule-form col">
              <div className="sig-form-row">
                <input
                  placeholder="signature name"
                  value={sigDraft.name}
                  onChange={(e) =>
                    setSigDraft({ ...sigDraft, name: e.target.value })
                  }
                />
                <select
                  value={sigDraft.accountId ?? ''}
                  onChange={(e) =>
                    setSigDraft({
                      ...sigDraft,
                      accountId: e.target.value || null
                    })
                  }
                >
                  <option value="">All accounts</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
                <label className="sig-default">
                  <input
                    type="checkbox"
                    checked={sigDraft.isDefault}
                    onChange={(e) =>
                      setSigDraft({ ...sigDraft, isDefault: e.target.checked })
                    }
                  />
                  default
                </label>
              </div>
              <textarea
                className="sig-text"
                placeholder="Signature — plain text or simple HTML"
                value={sigDraft.html}
                onChange={(e) =>
                  setSigDraft({ ...sigDraft, html: e.target.value })
                }
              />
              <button
                className="tbtn"
                disabled={!sigDraft.name.trim() || !sigDraft.html.trim()}
                onClick={() => {
                  const id = crypto.randomUUID()
                  const list = settings.signatureList.map((x) =>
                    sigDraft.isDefault ? { ...x, isDefault: false } : x
                  )
                  void update({ signatureList: [...list, { ...sigDraft, id }] })
                  setSigDraft({
                    name: '',
                    html: '',
                    accountId: null,
                    isDefault: false
                  })
                }}
              >
                Add signature
              </button>
            </div>
          </Section>

          <Section title="Appearance">
            <label className="set-row">
              <span>Theme</span>
              <select
                value={settings.theme}
                onChange={(e) => update({ theme: e.target.value as Theme })}
              >
                <option value="dark">Dark (CRT)</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </label>
            <label className="set-row">
              <span>Phosphor color</span>
              <select
                value={settings.phosphor}
                onChange={(e) =>
                  update({ phosphor: e.target.value as Phosphor })
                }
              >
                <option value="mono">Default (mono)</option>
                <option value="green">Green terminal</option>
                <option value="amber">Amber terminal</option>
                <option value="ice">Ice blue</option>
                <option value="red">Red alert</option>
              </select>
            </label>
            <label className="set-row">
              <span>Font</span>
              <select
                value={settings.font}
                onChange={(e) => update({ font: e.target.value })}
              >
                {FONT_LIST.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="set-row">
              <span>Size · {settings.fontScale}%</span>
              <input
                type="range"
                min={80}
                max={140}
                step={5}
                value={settings.fontScale}
                onChange={(e) => update({ fontScale: Number(e.target.value) })}
              />
            </label>
          </Section>

          <Section title="Dashboard cards">
            <label className="set-row">
              <span>Quick-link icons</span>
              <select
                value={settings.linkIconStyle}
                onChange={(e) =>
                  update({
                    linkIconStyle: e.target.value as AppSettings['linkIconStyle']
                  })
                }
              >
                <option value="favicon">Site favicons</option>
                <option value="letter">Letters (monogram)</option>
                <option value="minimal">Minimal ◆</option>
              </select>
            </label>
            <label className="set-row">
              <span>Stock trade links</span>
              <select
                value={settings.broker}
                onChange={(e) =>
                  update({ broker: e.target.value as AppSettings['broker'] })
                }
              >
                <option value="none">None</option>
                <option value="webull">Webull</option>
                <option value="robinhood">Robinhood</option>
                <option value="fidelity">Fidelity</option>
                <option value="schwab">Charles Schwab</option>
              </select>
            </label>
          </Section>

          <Section title="CRT effects">
            {(
              [
                ['scanlines', 'Scanlines'],
                ['glow', 'Phosphor glow'],
                ['flicker', 'CRT flicker'],
                ['grain', 'Film grain'],
                ['sweep', 'CRT refresh sweep'],
                ['glitch', 'Glitch jitter'],
                ['chromatic', 'Chromatic aberration'],
                ['pulse', 'Phosphor pulse (breathe)'],
                ['rain', 'Rain'],
                ['snow', 'Snow'],
                ['petals', 'Drifting petals'],
                ['embers', 'Rising embers']
              ] as Array<[keyof CrtEffects, string]>
            ).map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={settings.effects[key]}
                onChange={(v) =>
                  update({ effects: { ...settings.effects, [key]: v } })
                }
              />
            ))}
          </Section>

          <Section title="Startup">
            <label className="set-row">
              <span>Start in</span>
              <select
                value={settings.startView}
                onChange={(e) =>
                  update({
                    startView: e.target.value as AppSettings['startView']
                  })
                }
              >
                <option value="dashboard">Dashboard</option>
                <option value="mail">Mail</option>
              </select>
            </label>
            <Toggle
              label="Launch on login"
              checked={settings.autoLaunch}
              onChange={(v) => update({ autoLaunch: v })}
            />
            <Toggle
              label="Play screensaver sound on startup"
              checked={settings.ambientAutostart}
              onChange={(v) => update({ ambientAutostart: v })}
            />
            <Toggle
              label="Play music on startup"
              checked={settings.musicAutostart}
              onChange={(v) => update({ musicAutostart: v })}
            />
            <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
              Pick which sound/song with the “★ startup” buttons on the
              Screensaver and Player cards.
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="set-section">
      <div className="set-section-title">{title}</div>
      {children}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}): JSX.Element {
  return (
    <label className="set-row">
      <span>{label}</span>
      <button
        className={`switch ${checked ? 'on' : ''}`}
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
      >
        <span className="knob" />
      </button>
    </label>
  )
}
