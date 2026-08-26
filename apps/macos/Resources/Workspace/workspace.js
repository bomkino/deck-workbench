const INTERFACE_SCALE_STEPS = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75])

function workspaceTransforms({ interfaceScale: requestedInterfaceScale, artboardZoom: requestedZoom, canvas }) {
  const ui = Number(requestedInterfaceScale)
  const zoom = Number(requestedZoom)
  if (!INTERFACE_SCALE_STEPS.includes(ui)) throw new RangeError('Interface Scale must use an allowed step')
  if (!Number.isFinite(zoom) || zoom < 0.1 || zoom > 4) {
    throw new RangeError('Artboard zoom must be between 10% and 400%')
  }
  return Object.freeze({
    interfaceScale: ui,
    chromeRemPixels: 16 * ui,
    artboardTransform: `scale(${zoom})`,
    exportGeometry: Object.freeze({ width: canvas.width, height: canvas.height }),
  })
}

const elements = {
  deckTitle: document.querySelector('#deck-title'),
  sectionTitle: document.querySelector('#section-title'),
  slideLabel: document.querySelector('#slide-label'),
  headline: document.querySelector('#headline'),
  artboardHeadline: document.querySelector('#artboard-headline'),
  artboardIntent: document.querySelector('#artboard-intent'),
  revision: document.querySelector('#revision'),
  saveState: document.querySelector('#save-state'),
  binding: document.querySelector('#binding'),
  canvasPreset: document.querySelector('#canvas-preset'),
  commit: document.querySelector('#commit-headline'),
  undo: document.querySelector('#undo'),
  redo: document.querySelector('#redo'),
  interfaceScale: document.querySelector('#interface-scale'),
  artboardZoom: document.querySelector('#artboard-zoom'),
  zoomLabel: document.querySelector('#zoom-label'),
  inspectorZoom: document.querySelector('#inspector-zoom'),
  inspectorInterface: document.querySelector('#inspector-interface'),
  artboard: document.querySelector('#artboard'),
}

let projection = null
let interfaceScale = 1
let artboardZoom = 0.35

function richText(value) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }],
  }
}

function setBusy(label) {
  elements.saveState.textContent = label
  elements.commit.disabled = true
  elements.undo.disabled = true
  elements.redo.disabled = true
}

function renderProjection(next) {
  projection = next
  elements.deckTitle.textContent = next.deckTitle
  elements.sectionTitle.textContent = next.section.title
  elements.slideLabel.textContent = next.slide.intent[0].toUpperCase() + next.slide.intent.slice(1)
  elements.headline.disabled = false
  elements.headline.value = next.headline.plainText
  elements.artboardHeadline.textContent = next.headline.plainText
  elements.artboardIntent.textContent = next.slide.intent
  elements.revision.textContent = `Revision ${next.revision}`
  elements.binding.textContent = next.headline.semanticKey
  elements.canvasPreset.textContent = `${next.canvas.width} × ${next.canvas.height}`
  elements.commit.disabled = false
  elements.undo.disabled = !next.history.canUndo
  elements.redo.disabled = !next.history.canRedo
  elements.saveState.textContent = 'Durable and projected'
  applyScales()
  return next
}

function applyScales() {
  const canvas = projection?.canvas ?? { width: 2576, height: 1080 }
  const transforms = workspaceTransforms({ interfaceScale, artboardZoom, canvas })
  document.documentElement.style.setProperty('--interface-scale', String(transforms.interfaceScale))
  document.documentElement.style.setProperty('--artboard-zoom', String(artboardZoom))
  elements.interfaceScale.value = String(interfaceScale)
  elements.artboardZoom.value = String(artboardZoom)
  const zoomPercent = `${Math.round(artboardZoom * 100)}%`
  elements.zoomLabel.textContent = zoomPercent
  elements.inspectorZoom.textContent = zoomPercent
  elements.inspectorInterface.textContent = `${Math.round(interfaceScale * 100)}%`
}

async function commitHeadline() {
  if (!projection) return
  setBusy('Validating and writing journal…')
  try {
    const result = await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type: 'content.update',
        payload: {
          slideId: projection.slide.id,
          blockId: projection.headline.id,
          value: richText(elements.headline.value),
        },
        source: { kind: 'ui', label: 'Story headline' },
        issuedAt: new Date().toISOString(),
      },
    })
    renderProjection(result.projection)
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    renderProjection(projection)
  }
}

async function historyAction(method) {
  if (!projection) return
  setBusy(method === 'undo' ? 'Writing undo…' : 'Writing redo…')
  try {
    const result = await window.deckBridge[method]()
    renderProjection(result.projection)
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    renderProjection(projection)
  }
}

elements.commit.addEventListener('click', commitHeadline)
elements.headline.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') commitHeadline()
})
elements.undo.addEventListener('click', () => historyAction('undo'))
elements.redo.addEventListener('click', () => historyAction('redo'))
elements.interfaceScale.addEventListener('change', async () => {
  const requested = Number(elements.interfaceScale.value)
  try {
    const result = await window.deckBridge.setInterfaceScale({ value: requested })
    interfaceScale = result.interfaceScale
    applyScales()
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
  }
})
elements.artboardZoom.addEventListener('input', async () => {
  const requested = Number(elements.artboardZoom.value)
  try {
    const result = await window.deckBridge.setArtboardZoom({ value: requested })
    artboardZoom = result.artboardZoom
    applyScales()
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
  }
})

async function boot() {
  try {
    const preferences = await window.deckBridge.getPreferences()
    interfaceScale = preferences.interfaceScale
    artboardZoom = preferences.artboardZoom
    applyScales()
    const next = await window.deckBridge.query({ name: 'slide.activeProjection', params: {} })
    renderProjection(next)
  } catch {
    applyScales()
  }
}

window.deckWorkbench = Object.freeze({
  renderProjection,
  exportFrame() {
    const rect = elements.artboard.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  },
  async tracerEditHeadline(text) {
    elements.headline.value = text
    await commitHeadline()
    return projection
  },
  projection() {
    return projection
  },
})

boot()
