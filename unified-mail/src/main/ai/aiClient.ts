// Optional AI helpers: summarize a thread, or draft a reply.
//
// Provider-agnostic: talks to Anthropic or OpenAI depending on settings. The
// API key is stored locally in settings and never leaves the user's machine
// except in the direct request to the chosen provider. If no provider/key is
// configured, callers get a friendly error.

import type { AiResult, Message, ThreadDetail } from '@shared/types'
import { getSettings } from '../settings/settingsStore'

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: 'claude-3-5-haiku-latest',
  openai: 'gpt-4o-mini',
  azure: '' // must be the deployment name the user configured
}

const AZURE_API_VERSION = '2024-06-01'

// Rough HTML -> text so prompts stay small and readable.
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function messageText(m: Message): string {
  const body = m.bodyText ?? (m.bodyHtml ? htmlToText(m.bodyHtml) : m.snippet)
  return (body ?? '').slice(0, 4000)
}

// Build a compact transcript of the thread for the model.
function threadTranscript(thread: ThreadDetail): string {
  const msgs = [...thread.messages].sort((a, b) => a.receivedAt - b.receivedAt)
  return msgs
    .map((m) => {
      const who = m.from ? `${m.from.name ?? ''} <${m.from.email}>`.trim() : 'Unknown'
      const when = new Date(m.receivedAt).toLocaleString()
      return `From: ${who}\nDate: ${when}\nSubject: ${m.subject}\n\n${messageText(m)}`
    })
    .join('\n\n---\n\n')
    .slice(0, 16000)
}

async function callAnthropic(
  key: string,
  model: string,
  system: string,
  user: string
): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }]
    })
  })
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>
  }
  return (data.content ?? [])
    .map((c) => c.text ?? '')
    .join('')
    .trim()
}

async function callOpenAI(
  key: string,
  model: string,
  system: string,
  user: string
): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

// Azure OpenAI (or a compatible endpoint). The base URL is the resource root
// (e.g. https://myres.openai.azure.com); we build the deployment path. If the
// user pastes a full .../chat/completions URL, we use it verbatim.
async function callAzure(
  baseUrl: string,
  key: string,
  deployment: string,
  system: string,
  user: string
): Promise<string> {
  const trimmed = baseUrl.replace(/\/+$/, '')
  const url = /\/chat\/completions/i.test(trimmed)
    ? trimmed
    : `${trimmed}/openai/deployments/${deployment}/chat/completions?api-version=${AZURE_API_VERSION}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': key },
    body: JSON.stringify({
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) {
    throw new Error(`Azure ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return (data.choices?.[0]?.message?.content ?? '').trim()
}

async function complete(system: string, user: string): Promise<AiResult> {
  const s = getSettings()
  if (s.aiProvider === 'none' || !s.aiApiKey.trim()) {
    return {
      ok: false,
      error:
        'AI is not configured. Add a provider and API key in Settings → AI.'
    }
  }
  if (s.aiProvider === 'azure' && !s.aiBaseUrl.trim()) {
    return {
      ok: false,
      error: 'Azure needs an endpoint URL in Settings → AI.'
    }
  }
  const model = s.aiModel.trim() || DEFAULT_MODEL[s.aiProvider]
  try {
    let text: string
    if (s.aiProvider === 'anthropic')
      text = await callAnthropic(s.aiApiKey, model, system, user)
    else if (s.aiProvider === 'azure')
      text = await callAzure(s.aiBaseUrl, s.aiApiKey, model, system, user)
    else text = await callOpenAI(s.aiApiKey, model, system, user)
    return { ok: true, text }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function summarizeThread(thread: ThreadDetail): Promise<AiResult> {
  const system =
    'You are an assistant that summarizes email threads for a busy reader. ' +
    'Be concise. Lead with a one-sentence TL;DR, then 2-5 short bullet points ' +
    'of key facts, decisions, and any action items or questions directed at ' +
    'the reader. Do not invent details.'
  const user = `Summarize this email thread:\n\n${threadTranscript(thread)}`
  return complete(system, user)
}

// Summarize a batch of inbox messages into a scannable digest.
export async function summarizeDigest(
  messages: Message[],
  rangeLabel: string
): Promise<AiResult> {
  if (messages.length === 0) {
    return { ok: true, text: `No messages for ${rangeLabel}.` }
  }
  const lines = messages
    .slice(0, 120)
    .map((m, i) => {
      const who = m.from ? `${m.from.name ?? ''} <${m.from.email}>`.trim() : 'Unknown'
      const when = new Date(m.receivedAt).toLocaleString()
      const body = (m.bodyText ?? (m.bodyHtml ? htmlToText(m.bodyHtml) : m.snippet) ?? '').slice(0, 400)
      return `${i + 1}. From: ${who} | ${when}\n   Subject: ${m.subject}\n   ${body}`
    })
    .join('\n')
    .slice(0, 18000)
  const system =
    'You summarize a batch of emails into a concise, scannable digest for a ' +
    'busy reader. Group related messages. Lead with a one-line overview, then ' +
    'short sections: "Needs your attention" (action items, questions, ' +
    'deadlines), "Notable" (important FYIs), and "Low priority" (newsletters/' +
    'promotions, grouped by sender). Keep it brief and do not invent details.'
  const user = `Summarize these ${messages.length} emails from ${rangeLabel}:\n\n${lines}`
  return complete(system, user)
}

export async function draftReply(
  thread: ThreadDetail,
  instructions: string
): Promise<AiResult> {
  const system =
    'You draft email replies on behalf of the user. Match a natural, ' +
    'professional tone. Write only the reply body (no subject, no signature, ' +
    'no "Here is a draft" preamble). Keep it focused and ready to send or ' +
    'lightly edit.'
  const guide = instructions.trim()
    ? `The user wants the reply to: ${instructions.trim()}\n\n`
    : ''
  const user =
    `${guide}Draft a reply to the most recent message in this thread:\n\n` +
    threadTranscript(thread)
  return complete(system, user)
}
