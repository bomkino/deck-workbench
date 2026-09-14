import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
await mkdir(resolve(root, 'build/generated'), { recursive: true })
await build({
  entryPoints: [resolve(root, 'packages/psd-export/src/psd-encoder.js')],
  outfile: resolve(root, 'build/generated/psd-encoder.js'),
  bundle: true,
  platform: 'browser',
  mainFields: ['main'],
  format: 'iife',
  target: ['safari18'],
  legalComments: 'inline',
  sourcemap: false,
  minify: true,
  banner: { js: '/* Generated PSD encoder. ag-psd 31.0.2; see bundled Legal notices. No DOM or Node runtime. */' },
})
