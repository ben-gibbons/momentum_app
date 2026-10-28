// repositories/riskFactors.ts
// Risk-factor catalog (selectable defaults + user-created custom entries) and selection flow.
// Selecting a factor seeds a procrastination log and records a recurring risk_factors instance
// (recur_until = 14 days out) that the morning routine reads to create recurring daily tasks.
import { getDb } from '../db'
import type { RiskFactorCatalogItem } from '../../shared/types'
import { nowSecs, startOfDay } from './util'
import * as logs from './logs'
import * as tasks from './tasks'

const RECUR_DAYS = 14

interface CatalogRow {
  id: number
  label: string
  is_custom: number
}

export function listCatalog(): RiskFactorCatalogItem[] {
  const rows = getDb()
    .prepare('SELECT id, label, is_custom FROM risk_factor_catalog ORDER BY is_custom, id')
    .all() as CatalogRow[]
  return rows.map((r) => ({ id: r.id, label: r.label, isCustom: !!r.is_custom }))
}

export function addCustom(label: string): number {
  const result = getDb()
    .prepare('INSERT INTO risk_factor_catalog (label, is_custom, created_at) VALUES (?, 1, ?)')
    .run(label, nowSecs())
  return result.lastInsertRowid as number
}

// Select a risk factor: open a seeded procrastination log, and — only when recur is true —
// record a 14-day recurring instance (which the morning routine turns into recurring daily
// tasks). Returns the new log id.
export function select(catalogId: number, recur = false): number {
  // One transaction: the recur window, the series it drives and the log land together or not at all.
  return getDb().transaction(() => {
    const factor = getDb()
      .prepare('SELECT label FROM risk_factor_catalog WHERE id = ?')
      .get(catalogId) as { label: string } | undefined
    if (!factor) throw new Error(`Risk factor ${catalogId} not found`)

    if (recur) {
      const now = nowSecs()
      const until = now + RECUR_DAYS * 86400
      // Re-selecting a factor that is still active extends its window rather than starting a
      // second one — there is one task series per factor (tasks.ensureRiskFactorSeries).
      const active = getDb()
        .prepare(
          'SELECT id, recur_until FROM risk_factors WHERE factor = ? AND recur_until >= ? ORDER BY id DESC'
        )
        .get(factor.label, now) as { id: number; recur_until: number } | undefined
      let rowId: number
      if (active) {
        getDb()
          .prepare('UPDATE risk_factors SET recur_until = ? WHERE id = ?')
          .run(until, active.id)
        rowId = active.id
      } else {
        rowId = getDb()
          .prepare('INSERT INTO risk_factors (factor, created_at, recur_until) VALUES (?, ?, ?)')
          .run(factor.label, now, until).lastInsertRowid as number
      }
      // The task series follows the new window (or restarts today if the user had ended it).
      tasks.reselectRiskFactorSeries(
        { id: rowId, factor: factor.label },
        active ? startOfDay(active.recur_until) : null,
        startOfDay(until)
      )
    }

    // In progress until the user finishes the flow (the Logs list says so and resumes it).
    return logs.create({ source: 'risk_factor', riskFactor: factor.label, completed: false })
  })()
}
