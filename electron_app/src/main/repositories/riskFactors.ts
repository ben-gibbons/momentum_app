// repositories/riskFactors.ts
// Risk-factor catalog (selectable defaults + user-created custom entries) and selection flow.
// Selecting a factor seeds a procrastination log and records a recurring risk_factors instance
// (recur_until = 14 days out) that the morning routine reads to create recurring daily tasks.
import { getDb } from '../db'
import type { RiskFactorCatalogItem } from '../../shared/types'
import { nowSecs } from './util'
import * as logs from './logs'

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
  const factor = getDb()
    .prepare('SELECT label FROM risk_factor_catalog WHERE id = ?')
    .get(catalogId) as { label: string } | undefined
  if (!factor) throw new Error(`Risk factor ${catalogId} not found`)

  if (recur) {
    const now = nowSecs()
    const until = now + RECUR_DAYS * 86400
    // Re-selecting a factor that is still active extends its window rather than starting a
    // second one — the routine makes one task series per factor row.
    const active = getDb()
      .prepare('SELECT id FROM risk_factors WHERE factor = ? AND recur_until >= ? ORDER BY id DESC')
      .get(factor.label, now) as { id: number } | undefined
    if (active) {
      getDb().prepare('UPDATE risk_factors SET recur_until = ? WHERE id = ?').run(until, active.id)
    } else {
      getDb()
        .prepare('INSERT INTO risk_factors (factor, created_at, recur_until) VALUES (?, ?, ?)')
        .run(factor.label, now, until)
    }
  }

  return logs.create({ source: 'risk_factor', riskFactor: factor.label })
}
