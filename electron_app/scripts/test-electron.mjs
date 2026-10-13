// scripts/test-electron.mjs
// Runs vitest under Electron's own Node (ELECTRON_RUN_AS_NODE=1) so tests that open a real
// SQLite database can load better-sqlite3, which postinstall rebuilds for Electron's ABI — plain
// `npm test` (system Node) cannot load it, and those suites skip themselves there. Any extra
// arguments are passed through to vitest. Run from electron_app/ with:
//   npm run test:electron            # the DB-backed suites (db, routine, tasks, sessions)
//   npm run test:electron -- --watch
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electron = require('electron') // the path to the Electron binary
// vitest's CLI entry isn't in its package exports, so locate it from the package root.
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const extra = process.argv.slice(2)
const files = extra.some((a) => !a.startsWith('-'))
  ? []
  : [
      'src/main/db.test.ts',
      'src/main/routine.test.ts',
      'src/main/repositories/tasks.test.ts',
      'src/main/repositories/sessions.test.ts'
    ]

const child = spawn(electron, [vitest, 'run', ...files, ...extra], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
child.on('exit', (code) => process.exit(code ?? 1))
