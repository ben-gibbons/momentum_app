// repositories/classificationRules.ts
// The productive/unproductive lists (classification_rules table) and the "not sure yet" reclassify
// list. Created for the V1 classification engine. add() is the one operation behind both
// "add to list" and "reclassify": it upserts the rule and rewrites matching past not-sure
// session rows in the same transaction. remove() never reverts rows.
import { getDb } from '../db'
import { BROWSER_APP, DESKTOP_APP, normalizePattern } from '../classifier'
import {
  Classification,
  type ClassificationRule,
  type NotSureItem,
  type RuleInput,
  type RuleKind
} from '../../shared/types'
import { nowSecs } from './util'

interface RuleRow {
  id: number
  kind: RuleKind
  pattern: string
  classification: 1 | 2
  created_at: number
}

const SELECT_RULE = 'SELECT id, kind, pattern, classification, created_at FROM classification_rules'

// Lowercase owner.name values of browsers, as get-windows reports them. Only Edge is monitored in
// V1, but none of them belongs on a list.
const BROWSER_NAMES = new Set([
  'microsoft edge',
  'microsoft edge beta',
  'microsoft edge dev',
  'microsoft edge canary',
  'google chrome',
  'chrome',
  'firefox',
  'mozilla firefox',
  'brave',
  'brave browser',
  'opera',
  'vivaldi',
  'safari'
])

// "Not sure yet" only looks back this far; older unsorted things aren't worth the user's attention
// and this keeps the list (and the GROUP BY scan, via idx_sessions_start_time) bounded.
const NOT_SURE_WINDOW_DAYS = 30

function toRule(r: RuleRow): ClassificationRule {
  return {
    id: r.id,
    kind: r.kind,
    pattern: r.pattern,
    classification: r.classification,
    createdAt: r.created_at
  }
}

export function list(): ClassificationRule[] {
  return (getDb().prepare(`${SELECT_RULE} ORDER BY kind, pattern`).all() as RuleRow[]).map(toRule)
}

export function remove(id: number): void {
  getDb().prepare('DELETE FROM classification_rules WHERE id = ?').run(id)
}

// Upsert the rule, then reclassify past not-sure sessions it matches. Returns the stored rule and
// the number of session rows rewritten.
export function add(input: RuleInput): { rule: ClassificationRule; reclassified: number } {
  // Validate here (not in ipc.ts) so the table's CHECK constraints and the matcher have one guard.
  if (input.kind !== 'app' && input.kind !== 'site') {
    throw new Error(`Invalid rule kind: ${String(input.kind)}`)
  }
  if (input.classification !== 1 && input.classification !== 2) {
    throw new Error(`Invalid rule classification: ${String(input.classification)}`)
  }
  const pattern = normalizePattern(input.kind, String(input.pattern ?? ''))
  if (!pattern) throw new Error('Rule pattern cannot be empty')
  // A browser as a whole is neither productive nor unproductive — the sites in it are. (An app rule
  // for the browser would also classify every unlisted site, bypassing strict mode.)
  if (input.kind === 'app' && BROWSER_NAMES.has(pattern)) {
    throw new Error('Browsers cannot be added to these lists, only specific websites are accepted')
  }
  if (input.kind === 'site') {
    // A pattern must be something a hostname can equal or end with at a dot boundary. Dotless
    // names are allowed (intranet hosts like "synology" are real, and exact match is safe), but
    // spaces or a stray wildcard mean it isn't a host at all.
    if (!/^[a-z0-9.-]+$/.test(pattern)) {
      throw new Error(`"${pattern}" is not a site address — try something like youtube.com`)
    }
  }
  const db = getDb()

  return db.transaction(() => {
    db.prepare(
      `INSERT INTO classification_rules (kind, pattern, classification, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(kind, pattern) DO UPDATE SET classification = excluded.classification`
    ).run(input.kind, pattern, input.classification, nowSecs())
    // Re-select rather than trust lastInsertRowid, which is stale on the conflict/update path.
    const row = db
      .prepare(`${SELECT_RULE} WHERE kind = ? AND pattern = ?`)
      .get(input.kind, pattern) as RuleRow

    // Same match semantics as the classifier: exact lowercase app name (app_key, lowercased in JS
    // at insert — SQLite's lower() is ASCII-only), or host at a dot boundary. LIKE treats % and _
    // as wildcards, so escape them in the bound pattern to keep the match exact.
    const likeSafe = pattern.replace(/[\\%_]/g, (c) => '\\' + c)
    const reclassify =
      input.kind === 'app'
        ? db
            .prepare(
              `UPDATE sessions SET classification = ?
               WHERE classification = ? AND app_key = ?`
            )
            .run(input.classification, Classification.NOT_SURE, pattern)
        : db
            .prepare(
              `UPDATE sessions SET classification = ?
               WHERE classification = ? AND (host = ? OR host LIKE '%.' || ? ESCAPE '\\')`
            )
            .run(input.classification, Classification.NOT_SURE, pattern, likeSafe)

    return { rule: toRule(row), reclassified: reclassify.changes }
  })()
}

// Not-sure apps (rows without a host, excluding the desktop placeholder and the browser — its
// host-less rows are sidecar lag / New Tab pages, and an app rule for the browser would whitelist
// every unlisted site) and sites (grouped by host), most time first, for the Settings reclassify
// list.
export function listNotSure(): NotSureItem[] {
  const excluded = [DESKTOP_APP, BROWSER_APP]
  const placeholders = excluded.map(() => '?').join(', ')
  // Bounded by a recency window rather than a row LIMIT: the renderer offers "most time" / "most
  // recent" orderings, and a cap applied here (sorted by time) would silently drop a site visited
  // a minute ago. Within the window the set is distinct apps + hosts, so it stays small. An open
  // session (total_seconds NULL) counts its elapsed time so a site the user just left isn't 0 min.
  const now = nowSecs()
  const since = now - NOT_SURE_WINDOW_DAYS * 86400
  const rows = getDb()
    .prepare(
      `SELECT kind, pattern, secs, last_seen FROM (
         SELECT 'app' AS kind, MAX(app) AS pattern,
                SUM(COALESCE(total_seconds, ? - start_time)) AS secs, MAX(start_time) AS last_seen
         FROM sessions
         WHERE classification = ? AND start_time >= ? AND host IS NULL
           AND app_key NOT IN (${placeholders})
         GROUP BY app_key
         UNION ALL
         SELECT 'site' AS kind, host AS pattern,
                SUM(COALESCE(total_seconds, ? - start_time)) AS secs, MAX(start_time) AS last_seen
         FROM sessions
         WHERE classification = ? AND start_time >= ? AND host IS NOT NULL
         GROUP BY host
       )
       ORDER BY secs DESC`
    )
    .all(
      now,
      Classification.NOT_SURE,
      since,
      ...excluded.map((a) => a.toLowerCase()),
      now,
      Classification.NOT_SURE,
      since
    ) as {
    kind: RuleKind
    pattern: string
    secs: number
    last_seen: number
  }[]

  return rows.map((r) => ({
    kind: r.kind,
    pattern: r.pattern,
    minutes: Math.round(r.secs / 60),
    lastSeen: r.last_seen
  }))
}
