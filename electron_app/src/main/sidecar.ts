import { spawn } from 'child_process'
import { createInterface } from 'readline'
import { join } from 'path'
import { app } from 'electron'
import { edgeUrls } from './monitor'

// In dev, read-edge-url.py lives in the poc folder at the repo root.
// TODO: bundle as a resource for production builds.
const scriptPath = join(app.getAppPath(), '..', 'poc', 'read-edge-url.py')

export function startSidecar(): void {
  const pyProc = spawn('python', [scriptPath])

  createInterface({ input: pyProc.stdout }).on('line', (line) => {
    try {
      const { handle, url } = JSON.parse(line)
      if (handle != null) edgeUrls.set(handle, url)
    } catch {}
  })

  pyProc.stderr.on('data', (d) => process.stderr.write(d))

  pyProc.on('exit', (code) => {
    console.error(`[sidecar] Python process exited with code ${code}`)
  })
}
