// Submission telemetry for bidder actions (see docs/FRONTEND_CONTRACT.md).
// The server re-hashes both headers before storing them and keeps no raw IPs.

const DEVICE_KEY = 'bidmark.device'

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function deviceId(): Promise<string> {
  let seed: string | null = null
  try { seed = localStorage.getItem(DEVICE_KEY) } catch { /* storage blocked */ }
  if (!seed) {
    seed = crypto.randomUUID()
    try { localStorage.setItem(DEVICE_KEY, seed) } catch { /* storage blocked */ }
  }
  const traits = [
    navigator.userAgent,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.hardwareConcurrency,
    seed,
  ].join('|')
  return sha256(traits)
}

export interface FormSignals {
  paste_count: number
  keystrokes: number
  fill_ms: number
}

export function createFormTracker() {
  const started = performance.now()
  const signals = { paste_count: 0, keystrokes: 0 }
  return {
    onPaste: () => { signals.paste_count += 1 },
    onKeyDown: () => { signals.keystrokes += 1 },
    snapshot: (): FormSignals => ({ ...signals, fill_ms: Math.round(performance.now() - started) }),
  }
}

export async function telemetryHeaders(signals?: FormSignals): Promise<Record<string, string>> {
  const payload = {
    paste_count: signals?.paste_count ?? 0,
    keystrokes: signals?.keystrokes ?? 0,
    fill_ms: signals?.fill_ms ?? 0,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
  return { 'X-Device-Id': await deviceId(), 'X-Session-Signals': JSON.stringify(payload) }
}
