const IST = 'Asia/Kolkata'

// The API returns some timestamps without an offset; those are UTC.
export function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null
  const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(value)
  const date = new Date(hasZone || value.length <= 10 ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value: string | null | undefined): string {
  const d = parseTime(value)
  if (!d) return 'Not recorded'
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST })
}

export function formatDateTime(value: string | null | undefined): string {
  const d = parseTime(value)
  if (!d) return 'Not recorded'
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: IST })
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: IST })
  return `${date}, ${time} IST`
}

export function formatTime(value: string | null | undefined): string {
  const d = parseTime(value)
  if (!d) return ''
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: IST })
}

export function relativeDays(value: string | null | undefined): string {
  const d = parseTime(value)
  if (!d) return ''
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  return days > 0 ? `in ${days} days` : `${-days} days ago`
}

export function hoursUntil(value: string | null | undefined): number | null {
  const d = parseTime(value)
  return d ? (d.getTime() - Date.now()) / 3_600_000 : null
}

export function formatINR(value: number | null | undefined): string {
  if (value == null) return 'Not declared'
  if (value >= 1e7) return `₹${(value / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} crore`
  if (value >= 1e5) return `₹${(value / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })} lakh`
  return `₹${value.toLocaleString('en-IN')}`
}

export function formatINRFull(value: number | null | undefined): string {
  if (value == null) return 'Not declared'
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

export function shortHash(hash: string | null | undefined, n = 10): string {
  if (!hash) return ''
  return hash.slice(0, n)
}

export function initials(name: string): string {
  return name
    .replace(/\b(Pvt|Private|Ltd|Limited|LLP)\b\.?/gi, '')
    .split(/\s+/)
    .filter(w => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

export function humanise(code: string): string {
  const lower = code.replace(/_/g, ' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export function greeting(): string {
  const hour = Number(new Date().toLocaleString('en-IN', { hour: 'numeric', hour12: false, timeZone: IST }))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(fullName: string): string {
  return fullName.split(',')[0].trim()
}
