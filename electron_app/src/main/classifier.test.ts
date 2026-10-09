// classifier.test.ts
// Unit tests for the pure classifier (vitest, run with `npm test`). Covers URL → host parsing,
// rule matching semantics (dot boundary, longest pattern, case-insensitive apps), strict mode,
// the self-app / Edge-lag exceptions, and multi-window winner selection.
import { describe, expect, it } from 'vitest'
import type { ClassificationRule } from '../shared/types'
import { classifyPoll, classifyWindow, edgeAppName, hostOf, normalizePattern } from './classifier'

function rule(
  kind: 'app' | 'site',
  pattern: string,
  classification: 1 | 2,
  id = 0
): ClassificationRule {
  return { id, kind, pattern, classification, createdAt: 0 }
}

describe('hostOf', () => {
  it('strips scheme, path, and a leading www.', () => {
    expect(hostOf('https://www.youtube.com/watch?v=abc')).toBe('youtube.com')
  })
  it('accepts scheme-less URLs', () => {
    expect(hostOf('youtube.com/watch?v=abc')).toBe('youtube.com')
    expect(hostOf('localhost:5173/app')).toBe('localhost')
  })
  it('keeps non-www subdomains and lowercases', () => {
    expect(hostOf('https://M.YouTube.com')).toBe('m.youtube.com')
  })
  it('returns null for non-site input', () => {
    expect(hostOf('edge://newtab')).toBeNull()
    expect(hostOf('about:blank')).toBeNull()
    expect(hostOf('how to cook rice')).toBeNull()
    expect(hostOf('')).toBeNull()
    expect(hostOf(null)).toBeNull()
    expect(hostOf(undefined)).toBeNull()
  })
})

describe('normalizePattern', () => {
  it('reduces a pasted full URL to its bare host', () => {
    expect(normalizePattern('site', '  https://www.YouTube.com/watch?v=abc ')).toBe('youtube.com')
  })
  it('strips www. from a bare host', () => {
    expect(normalizePattern('site', 'www.reddit.com')).toBe('reddit.com')
  })
  it('strips stray leading/trailing dots', () => {
    expect(normalizePattern('site', '.youtube.com')).toBe('youtube.com')
    expect(normalizePattern('site', 'https://.youtube.com')).toBe('youtube.com')
  })
  it('strips a leading wildcard, which the suffix matcher already implies', () => {
    expect(normalizePattern('site', '*.youtube.com')).toBe('youtube.com')
    expect(normalizePattern('site', 'https://*.youtube.com/')).toBe('youtube.com')
  })
  it('trims and lowercases app names', () => {
    expect(normalizePattern('app', '  Visual Studio Code ')).toBe('visual studio code')
  })
})

describe('edgeAppName', () => {
  it('takes the app name after the last " | ", else the whole title', () => {
    expect(edgeAppName('Hulu - App | Hulu')).toBe('Hulu')
    expect(edgeAppName('Inbox - Outlook | Outlook')).toBe('Outlook')
    expect(edgeAppName('Picture in picture')).toBe('Edge - Picture in picture')
    expect(edgeAppName('DevTools - https://example.com/')).toBe('Edge - DevTools')
    expect(edgeAppName('   ')).toBe('Edge app')
  })
})

describe('classifyWindow', () => {
  const edge = (
    url: string | null | undefined
  ): { app: string; url: string | null | undefined } => ({
    app: 'Microsoft Edge',
    url
  })

  it('matches www. and m. subdomains of a site rule', () => {
    const rules = [rule('site', 'youtube.com', 2)]
    expect(classifyWindow(edge('https://www.youtube.com/'), rules, false)).toBe(2)
    expect(classifyWindow(edge('https://m.youtube.com/'), rules, false)).toBe(2)
  })

  it('matches only at a dot boundary (x.com does not match netflix.com)', () => {
    expect(classifyWindow(edge('https://netflix.com/'), [rule('site', 'x.com', 2)], false)).toBe(3)
    expect(
      classifyWindow(edge('https://notyoutube.com/'), [rule('site', 'youtube.com', 2)], false)
    ).toBe(3)
    expect(classifyWindow(edge('https://x.com/home'), [rule('site', 'x.com', 2)], false)).toBe(2)
  })

  it('lets the longest matching site pattern win', () => {
    const rules = [rule('site', 'youtube.com', 2), rule('site', 'music.youtube.com', 1)]
    expect(classifyWindow(edge('https://music.youtube.com/'), rules, false)).toBe(1)
    expect(classifyWindow(edge('https://www.youtube.com/'), rules, false)).toBe(2)
    // Order of rules must not matter.
    expect(classifyWindow(edge('https://music.youtube.com/'), [...rules].reverse(), false)).toBe(1)
  })

  it('matches app rules case-insensitively', () => {
    const rules = [rule('app', 'visual studio code', 1)]
    expect(classifyWindow({ app: 'Visual Studio Code' }, rules, false)).toBe(1)
    expect(classifyWindow({ app: 'VISUAL STUDIO CODE' }, rules, true)).toBe(1)
  })

  it('a browser app rule only covers host-less windows, never a site', () => {
    const rules = [rule('app', 'microsoft edge', 1), rule('site', 'youtube.com', 2)]
    expect(classifyWindow(edge('https://youtube.com/'), rules, false)).toBe(2)
    // An unlisted site stays unlisted (strict mode decides) even with a browser app rule.
    expect(classifyWindow(edge('https://docs.example.com/'), rules, false)).toBe(3)
    expect(classifyWindow(edge('https://docs.example.com/'), rules, true)).toBe(2)
    // The app rule applies when there is no readable host.
    expect(classifyWindow(edge(null), rules, true)).toBe(1)
  })

  it('treats unlisted windows as not-sure with strict off and unproductive with strict on', () => {
    expect(classifyWindow({ app: 'Spotify' }, [], false)).toBe(3)
    expect(classifyWindow({ app: 'Spotify' }, [], true)).toBe(2)
    expect(classifyWindow(edge('https://unlisted.example/'), [], true)).toBe(2)
  })

  it('keeps Edge with no readable host not-sure even under strict mode', () => {
    expect(classifyWindow(edge(undefined), [], true)).toBe(3)
    expect(classifyWindow(edge(null), [], true)).toBe(3)
    expect(classifyWindow(edge('edge://newtab'), [], true)).toBe(3)
    // ...unless an app rule for Edge itself exists.
    expect(classifyWindow(edge(null), [rule('app', 'microsoft edge', 1)], true)).toBe(1)
    // The exemption is keyed on the url marker, not the app name: a non-browser app whose name
    // happens to contain "edge" is still unlisted under strict mode.
    expect(classifyWindow({ app: 'Ledger Live' }, [], true)).toBe(2)
  })

  it('classifies the self app like any other app (productive via its default rule)', () => {
    expect(classifyWindow({ app: 'Momentum App' }, [rule('app', 'momentum app', 1)], true)).toBe(1)
    expect(classifyWindow({ app: 'Momentum App' }, [], false)).toBe(3)
  })
})

describe('classifyPoll', () => {
  const code = { app: 'Visual Studio Code' }
  const youtube = { app: 'Microsoft Edge', url: 'https://www.youtube.com/watch?v=1' }
  const edgeLag = { app: 'Microsoft Edge', url: undefined }
  const rules = [rule('app', 'visual studio code', 1), rule('site', 'youtube.com', 2)]

  it('returns Desktop / not-sure for an empty poll', () => {
    expect(classifyPoll([], rules, false)).toEqual({
      classification: 3,
      app: 'Desktop',
      url: null,
      host: null
    })
  })

  it('lets any unproductive window override a productive front window', () => {
    expect(classifyPoll([code, youtube], rules, false)).toEqual({
      classification: 2,
      app: 'Microsoft Edge',
      url: youtube.url,
      host: 'youtube.com'
    })
  })

  it('lets the front window decide when nothing visible is unproductive', () => {
    // An unlisted site in front stays not-sure even with a productive app visible behind it.
    const reddit = { app: 'Microsoft Edge', url: 'https://www.reddit.com/' }
    expect(classifyPoll([reddit, code], rules, false)).toEqual({
      classification: 3,
      app: 'Microsoft Edge',
      url: reddit.url,
      host: 'reddit.com'
    })
    // ...and a productive front window is productive regardless of what's behind it.
    expect(classifyPoll([code, edgeLag], rules, false).classification).toBe(1)
  })

  it('breaks ties in favour of the front-most window', () => {
    const result = classifyPoll([{ app: 'Spotify' }, { app: 'Slack' }], [], false)
    expect(result.classification).toBe(3)
    expect(result.app).toBe('Spotify')
    const strict = classifyPoll([{ app: 'Spotify' }, { app: 'Slack' }], [], true)
    expect(strict.classification).toBe(2)
    expect(strict.app).toBe('Spotify')
  })
})
