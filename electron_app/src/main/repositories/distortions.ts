// repositories/distortions.ts
// The static Burns cognitive-distortion list, selectable in the CBT log flow.
import { getDb } from '../db'

export function list(): string[] {
  const rows = getDb().prepare('SELECT label FROM distortions ORDER BY ordinal').all() as {
    label: string
  }[]
  return rows.map((r) => r.label)
}
