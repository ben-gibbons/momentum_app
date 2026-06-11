// db.ts
// Lowest-level database module. getDb() opens the SQLite file on first call and returns
// the same connection every time after that (lazy singleton). On first launch it creates
// the sessions table; on subsequent launches CREATE TABLE IF NOT EXISTS is a no-op.
// All other modules access the DB through getDb() — nothing touches the file directly.
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(join(app.getPath('userData'), 'momentum.db'))
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id             INTEGER PRIMARY KEY,
        app            TEXT    NOT NULL,
        url            TEXT,
        classification INTEGER NOT NULL CHECK (classification IN (1, 2, 3)),
        start_time     INTEGER NOT NULL,
        end_time       INTEGER,
        total_seconds  INTEGER
      )
    `)
  }
  return db
}
