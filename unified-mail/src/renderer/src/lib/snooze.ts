// Snooze time presets (computed relative to now).

export interface SnoozeOption {
  label: string
  at: number // epoch ms; 0 = unsnooze
}

function atHour(base: Date, hour: number): Date {
  const d = new Date(base)
  d.setHours(hour, 0, 0, 0)
  return d
}

export function snoozeOptions(now = new Date()): SnoozeOption[] {
  const laterToday = new Date(now.getTime() + 3 * 3600_000)

  const tomorrow = atHour(new Date(now.getTime() + 86_400_000), 8)

  // Next Saturday 08:00.
  const weekend = atHour(now, 8)
  const daysToSat = (6 - now.getDay() + 7) % 7 || 7
  weekend.setDate(weekend.getDate() + daysToSat)

  // Next Monday 08:00.
  const nextWeek = atHour(now, 8)
  const daysToMon = (1 - now.getDay() + 7) % 7 || 7
  nextWeek.setDate(nextWeek.getDate() + daysToMon)

  return [
    { label: 'Later today (3h)', at: laterToday.getTime() },
    { label: 'Tomorrow 8am', at: tomorrow.getTime() },
    { label: 'This weekend', at: weekend.getTime() },
    { label: 'Next week', at: nextWeek.getTime() }
  ]
}
