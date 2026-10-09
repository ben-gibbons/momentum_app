// classifier.ts
// Pure classification logic for the monitoring loop: turns one poll's visible windows plus the
// user's productive/unproductive rules into a single classification (1 productive / 2 unproductive /
// 3 not-sure). Deliberately imports nothing from Electron or the DB so it can be unit-tested with
// vitest and reused by the rules repository (normalizePattern) and the schema migration (hostOf).
// Created for the V1 classification engine (roadmap item 1).
import { Classification, type ClassificationRule, type RuleKind } from '../shared/types'
import type { MonitorData } from './read_window'

// Momentum's own window. read_window renames it from the exe's name ('Electron' in dev,
// 'Momentum' packaged) so it classifies like any other app — it's on the Productive list by
// default (migration 5) — but it never triggers a nudge (threshold.ts).
export const SELF_APP = 'Momentum App'
// App name recorded when no window is visible (desktop only).
export const DESKTOP_APP = 'Desktop'
// The monitored browser's owner.name (V1 is Edge-only); its host-less rows are never offered as an
// app to reclassify.
export const BROWSER_APP = 'Microsoft Edge'

// Display name for an Edge window with no address bar. A site saved as an app is titled
// "<page title> | <app name>" ("Hulu - App | Hulu"), so the app name is the last " | " segment —
// the same name a standalone app of that site reports, so one rule covers both. Anything else
// (picture-in-picture, undocked DevTools) is an Edge feature, labelled "Edge - <feature>".
export function edgeAppName(title: string): string {
  const t = title.trim()
  const i = t.lastIndexOf(' | ')
  if (i >= 0) return t.slice(i + 3).trim() || 'Edge app'
  if (/^devtools\b/i.test(t)) return 'Edge - DevTools' // title carries the inspected URL; drop it
  return t ? `Edge - ${t}` : 'Edge app'
}

// The New Tab page, tracked as its own app (empty address bar reported by the sidecar).
export const EDGE_NEW_TAB = 'Edge - New tab'

export interface PollResult {
  classification: Classification
  app: string
  url: string | null
  host: string | null
}

function tryUrl(s: string): URL | null {
  try {
    return new URL(s)
  } catch {
    return null
  }
}

// Lowercase hostname of a URL minus a leading "www.", or null when there is no usable site host:
// non-http(s) schemes (edge://newtab, about:blank), plain search text typed into the address bar,
// empty strings. Scheme-less input ("youtube.com/watch", "localhost:5173") is retried with
// "https://" in front — parsing it as-is would read "localhost:" as the scheme.
export function hostOf(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? ''
  if (!trimmed) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
  const parsed = hasScheme ? tryUrl(trimmed) : tryUrl('https://' + trimmed)
  if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) return null
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  return host.length > 0 ? host : null
}

// Canonical stored form of a rule pattern: trimmed + lowercase; a site pattern pasted as a full
// URL is reduced to its bare host.
export function normalizePattern(kind: RuleKind, raw: string): string {
  const s = raw.trim().toLowerCase()
  if (kind === 'app') return s
  // A leading "*." is what people type for "all subdomains"; the suffix matcher already implies
  // that, and a literal "*" would never match, so strip it.
  return (hostOf(s) ?? s)
    .replace(/^(\*\.)+/, '')
    .replace(/^www\./, '')
    .replace(/^\.+|\.+$/g, '') // ".youtube.com" would never match at a dot boundary
}

// Classify one visible window. Order: site rule (longest matching pattern wins, so
// "music.youtube.com → productive" can override "youtube.com → unproductive") → app rule (exact,
// case-insensitive) → Edge whose URL the sidecar hasn't read yet → unlisted (strict decides).
export function classifyWindow(
  w: MonitorData,
  rules: ClassificationRule[],
  strict: boolean
): Classification {
  const app = w.app.toLowerCase()

  const host = hostOf(w.url)
  if (host) {
    let best: ClassificationRule | null = null
    for (const r of rules) {
      if (r.kind !== 'site') continue
      // Dot-boundary suffix match: "x.com" must not match "netflix.com".
      if (host === r.pattern || host.endsWith('.' + r.pattern)) {
        if (!best || r.pattern.length > best.pattern.length) best = r
      }
    }
    if (best) return best.classification
  }

  // Settings refuses app rules for browsers (classificationRules.add), but keep the guard: should
  // one exist, it may only cover windows with no readable host (sidecar lag, New Tab) — a site in
  // the browser is decided by site rules + strict mode, never by a browser-wide rule.
  const browserWithSite = 'url' in w && host !== null
  const appRule = browserWithSite
    ? undefined
    : rules.find((r) => r.kind === 'app' && r.pattern === app)
  if (appRule) return appRule.classification

  // Unknown is not unlisted: a browser window with no readable host is sidecar lag (or a newtab /
  // edge:// page), so strict mode must not count it as unproductive. read_window attaches the
  // `url` key only to Edge windows, so its presence (even undefined) is the browser marker.
  if ('url' in w && host === null) return Classification.NOT_SURE

  return strict ? Classification.UNPRODUCTIVE : Classification.NOT_SURE
}

// Classify a whole poll (all visible windows, front-most first). Any unproductive window anywhere
// overrides everything (the spec's "unproductive always wins"); otherwise the front window decides,
// so an unlisted site in front stays not-sure even with a productive app visible on another
// monitor — it must accrue toward the not-sure nudge and surface in "Not sure yet" to be sorted.
// No windows → Desktop, not-sure.
export function classifyPoll(
  windows: MonitorData[],
  rules: ClassificationRule[],
  strict: boolean
): PollResult {
  if (windows.length === 0) {
    return { classification: Classification.NOT_SURE, app: DESKTOP_APP, url: null, host: null }
  }
  let winner = 0
  let winnerClass = classifyWindow(windows[0], rules, strict)
  if (winnerClass !== Classification.UNPRODUCTIVE) {
    for (let i = 1; i < windows.length; i++) {
      if (classifyWindow(windows[i], rules, strict) === Classification.UNPRODUCTIVE) {
        winner = i
        winnerClass = Classification.UNPRODUCTIVE
        break
      }
    }
  }
  const w = windows[winner]
  return { classification: winnerClass, app: w.app, url: w.url ?? null, host: hostOf(w.url) }
}
