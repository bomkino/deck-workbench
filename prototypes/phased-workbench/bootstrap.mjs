import { fixture } from './fixture.mjs'
import * as workflowModel from '../../packages/workflow-model/index.mjs'

globalThis.WB_DEPS = Object.freeze({ fixture, workflowModel })

await mountFragments()

for (const source of [
  './app-core-runtime.js',
  './app-core-setup.js',
  './app-plan-events.js',
  './app-plan-render.js',
  './app-plan-editor.js',
  './app-plan-import.js',
  './app-curate-ui.js',
  './app-curate-decisions.js',
  './app-curate-preview.js',
  './app-assemble-events.js',
  './app-assemble-render.js',
  './app-assemble-interaction.js',
  './app-assemble-actions.js',
  './app-handoff.js',
  './app-helpers.js',
  './app-start.js',
]) {
  await loadClassicScript(source)
}

async function mountFragments() {
  const phaseRoot = document.querySelector('#phase-root')
  const overlayRoot = document.querySelector('#overlay-root')
  const phaseMarkup = await Promise.all(
    ['plan', 'curate', 'assemble', 'handoff'].map((phase) => readFragment(`./fragments/${phase}.html`)),
  )
  phaseRoot.innerHTML = phaseMarkup.join('\n')
  overlayRoot.innerHTML = await readFragment('./fragments/overlays.html')
}

async function readFragment(source) {
  const response = await fetch(source, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Could not load ${source}: ${response.status}`)
  return response.text()
}

function loadClassicScript(source) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = source
    script.async = false
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', () => reject(new Error(`Could not load ${source}`)), { once: true })
    document.head.append(script)
  })
}
