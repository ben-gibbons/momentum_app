// scripts/make-icon.mjs
// One-time build helper: generates the Windows multi-size app icon (build/icon.ico, 16/32/48/256)
// from the design system's Momentum tile PNG. Run with `node scripts/make-icon.mjs` after the icon
// art changes. electron-builder picks up build/icon.ico for the packaged Windows app/installer.
import pngToIco from 'png-to-ico'
import { writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'build', 'icon.png') // 512x512 Momentum tile (copied from design_system/assets)
const out = join(root, 'build', 'icon.ico')

// Passing a single file PATH (not an array) makes png-to-ico auto-generate the standard Windows
// icon sizes (16/32/48/256). Passing an array would instead embed each buffer as-is (no resize).
const ico = await pngToIco(src)
await writeFile(out, ico)
console.log(`Wrote ${out} (${ico.length} bytes)`)
