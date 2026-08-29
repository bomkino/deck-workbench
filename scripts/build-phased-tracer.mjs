import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(root, 'prototypes/phased-workbench')
const output = resolve(root, process.env.PHASED_PREVIEW_OUTPUT ?? 'artifacts/phased-workbench-preview')
const workflowModel = resolve(root, 'packages/workflow-model/index.mjs')

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(source, output, { recursive: true })
await cp(workflowModel, resolve(output, 'workflow-model.mjs'))

const bootstrapPath = resolve(output, 'bootstrap.mjs')
const bootstrap = await readFile(bootstrapPath, 'utf8')
const rewritten = bootstrap.replace("../../packages/workflow-model/index.mjs", './workflow-model.mjs')
if (rewritten === bootstrap) {
  throw new Error('Could not rewrite the workflow-model import for the standalone preview')
}
await writeFile(bootstrapPath, rewritten)
await writeFile(
  resolve(output, 'preview-manifest.json'),
  `${JSON.stringify({
    format: 'pitchdog.phased-workbench-preview',
    version: 1,
    entry: 'index.html',
  }, null, 2)}\n`,
)

console.log(`Built self-contained phased preview: ${output}`)
