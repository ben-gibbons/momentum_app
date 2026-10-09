// repositories/settings.ts
// Minimal key/value settings (greeting name, popup thresholds, feature toggles). get/set are the
// raw string accessors; getAll() is the typed view the session manager and Settings screen use,
// with DEFAULTS filling any missing or unparsable key so a packaged build (empty settings table —
// seed.ts is dev-only) behaves sensibly.
import { getDb } from '../db'
import type { AppSettings } from '../../shared/types'

// Durations in seconds.
export const DEFAULTS: AppSettings = {
  userName: '',
  thresholdUnproductive: 120,
  thresholdNotSure: 300,
  cooldownUnproductive: 240, // double the thresholds by default
  cooldownNotSure: 600,
  strictMode: false,
  monitoringEnabled: true
}

export function get(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row ? row.value : null
}

export function set(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    .run(key, value)
}

// Number.isFinite guards against missing keys, blanks, and garbage; Number('') is 0, hence the
// explicit empty check.
function numberOr(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// The monitoring loop samples every 10 s; a threshold below that can't be observed, and a cooldown
// shorter than its threshold (or 0) would re-fire the nudge every poll. Clamped here, in main, so
// every writer (Settings UI, DevTools, a hand-edited DB) gets the same guarantee.
const MIN_DURATION = 10
function clampDurations(s: AppSettings): AppSettings {
  const thresholdUnproductive = Math.max(MIN_DURATION, s.thresholdUnproductive)
  const thresholdNotSure = Math.max(MIN_DURATION, s.thresholdNotSure)
  return {
    ...s,
    thresholdUnproductive,
    thresholdNotSure,
    cooldownUnproductive: Math.max(thresholdUnproductive, s.cooldownUnproductive),
    cooldownNotSure: Math.max(thresholdNotSure, s.cooldownNotSure)
  }
}

export function getAll(): AppSettings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const kv = new Map(rows.map((r) => [r.key, r.value]))
  return clampDurations({
    userName: kv.get('user_name') ?? DEFAULTS.userName,
    thresholdUnproductive: numberOr(
      kv.get('threshold_unproductive'),
      DEFAULTS.thresholdUnproductive
    ),
    thresholdNotSure: numberOr(kv.get('threshold_notsure'), DEFAULTS.thresholdNotSure),
    cooldownUnproductive: numberOr(
      kv.get('cooldown_unproductive'),
      DEFAULTS.cooldownUnproductive
    ),
    cooldownNotSure: numberOr(kv.get('cooldown_notsure'), DEFAULTS.cooldownNotSure),
    strictMode: kv.has('strict_mode') ? kv.get('strict_mode') === '1' : DEFAULTS.strictMode,
    monitoringEnabled: kv.has('monitoring_enabled')
      ? kv.get('monitoring_enabled') === '1'
      : DEFAULTS.monitoringEnabled
  })
}
