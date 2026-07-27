import type { Address } from '../../../shared/types'

export function relativeTime(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const diffDays = Math.floor((now.getTime() - ms) / 86_400_000)
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' })
  }
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : '2-digit'
  })
}

export function fullDate(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function displayName(addr: Address | null): string {
  if (!addr) return 'Unknown'
  return addr.name || addr.email
}

export function addressLine(list: Address[]): string {
  return list.map((a) => a.name || a.email).join(', ')
}

export function formatBytes(n: number): string {
  if (!n) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)}${units[i]}`
}
