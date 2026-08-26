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
  sequenceList: document.querySelector('#sequence-list'),
  addSection: document.querySelector('#add-section'),
  addSlide: document.querySelector('#add-slide'),
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
  slideIntent: document.querySelector('#slide-intent'),
  artboard: document.querySelector('#artboard'),
}

let projection = null
let storyDocument = null
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
  elements.addSection.disabled = true
  elements.addSlide.disabled = true
  elements.slideIntent.disabled = true
}

function renderProjection(next) {
  projection = next
  elements.deckTitle.textContent = next.deckTitle
  elements.headline.disabled = false
  elements.headline.value = next.headline.plainText
  elements.artboardHeadline.textContent = next.headline.plainText
  elements.artboardIntent.textContent = next.slide.intent
  elements.slideIntent.value = next.slide.intent
  elements.revision.textContent = `Revision ${next.revision}`
  elements.binding.textContent = next.headline.semanticKey
  elements.canvasPreset.textContent = `${next.canvas.width} × ${next.canvas.height}`
  elements.commit.disabled = false
  elements.undo.disabled = !next.history.canUndo
  elements.redo.disabled = !next.history.canRedo
  elements.addSection.disabled = false
  elements.addSlide.disabled = false
  elements.slideIntent.disabled = false
  elements.saveState.textContent = 'Durable and projected'
  applyScales()
  void refreshSequence()
  return next
}

function renderSequence(next) {
  storyDocument = next
  elements.sequenceList.replaceChildren()
  let slideNumber = 1
  next.sections.forEach((section, sectionIndex) => {
    const sectionRow = document.createElement('div')
    sectionRow.className = 'section-row'
    const title = document.createElement('strong')
    title.textContent = section.title
    sectionRow.append(title)
    const tools = document.createElement('span')
    tools.className = 'section-tools'
    const rename = document.createElement('button')
    rename.type = 'button'
    rename.className = 'rename-section'
    rename.textContent = 'Rename'
    rename.setAttribute('aria-label', `Rename ${section.title}`)
    rename.addEventListener('click', () => renameSection(section.id, section.title))
    tools.append(rename)
    if (sectionIndex > 0) {
      const move = document.createElement('button')
      move.type = 'button'
      move.className = 'move-up'
      move.textContent = '↑'
      move.setAttribute('aria-label', `Move ${section.title} up`)
      move.addEventListener('click', () => moveSectionUp(section.id))
      tools.append(move)
    }
    sectionRow.append(tools)
    elements.sequenceList.append(sectionRow)

    section.slides.forEach((slide, slideIndex) => {
      const entry = document.createElement('div')
      entry.className = 'slide-entry'
      const select = document.createElement('button')
      select.type = 'button'
      select.className = `slide-row${projection?.slide.id === slide.id ? ' selected' : ''}`
      const number = document.createElement('span')
      number.className = 'slide-number'
      number.textContent = String(slideNumber).padStart(2, '0')
      const label = document.createElement('span')
      label.textContent = slide.headline?.plainText || slide.intent
      select.append(number, label)
      select.addEventListener('click', () => selectSlide(slide.id))
      entry.append(select)
      if (slideIndex > 0) {
        const move = document.createElement('button')
        move.type = 'button'
        move.className = 'move-up'
        move.textContent = '↑'
        move.setAttribute('aria-label', `Move Slide ${slideNumber} up`)
        move.addEventListener('click', () => moveSlideUp(section.id, slide.id))
        entry.append(move)
      }
      elements.sequenceList.append(entry)
      slideNumber += 1
    })
  })
}

async function refreshSequence() {
  try {
    renderSequence(await window.deckBridge.query({ name: 'story.document', params: {} }))
  } catch {
    // No Deck is open yet; the native shell owns empty-document state.
  }
}

async function executeStructural(type, payload, selectedSlideId = projection?.slide.id) {
  if (!projection) return
  setBusy(`Validating ${type}…`)
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: 'ui', label: 'Story document' },
        issuedAt: new Date().toISOString(),
      },
    })
    const next = await window.deckBridge.query({
      name: 'slide.activeProjection',
      params: selectedSlideId ? { slideId: selectedSlideId } : {},
    })
    renderProjection(next)
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    renderProjection(projection)
  }
}

async function selectSlide(slideId) {
  try {
    renderProjection(await window.deckBridge.query({ name: 'slide.activeProjection', params: { slideId } }))
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
  }
}

async function addSection() {
  if (!storyDocument) return
  await executeStructural('section.add', {
    sectionId: crypto.randomUUID(),
    title: `Section ${storyDocument.sections.length + 1}`,
    afterSectionId: storyDocument.sections.at(-1)?.id ?? null,
  })
}

async function addSlide() {
  if (!storyDocument || !projection) return
  const section = storyDocument.sections.find((candidate) => candidate.id === projection.section.id)
  if (!section) return
  const slideId = crypto.randomUUID()
  await executeStructural('slide.add', {
    sectionId: section.id,
    slideId,
    blockId: crypto.randomUUID(),
    intent: 'statement',
    headline: richText('Untitled Story'),
    afterSlideId: section.slides.at(-1)?.id ?? null,
  }, slideId)
}

async function moveSectionUp(sectionId) {
  if (!storyDocument) return
  const index = storyDocument.sections.findIndex((section) => section.id === sectionId)
  if (index <= 0) return
  await executeStructural('section.move', {
    sectionId,
    afterSectionId: index > 1 ? storyDocument.sections[index - 2].id : null,
  })
}

async function renameSection(sectionId, currentTitle) {
  const title = window.prompt('Section name', currentTitle)?.trim()
  if (!title || title === currentTitle) return
  await executeStructural('section.rename', { sectionId, title })
}

async function moveSlideUp(sectionId, slideId) {
  if (!storyDocument) return
  const section = storyDocument.sections.find((candidate) => candidate.id === sectionId)
  const index = section?.slides.findIndex((slide) => slide.id === slideId) ?? -1
  if (index <= 0) return
  await executeStructural('slide.move', {
    slideId,
    targetSectionId: sectionId,
    afterSlideId: index > 1 ? section.slides[index - 2].id : null,
  }, slideId)
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
elements.addSection.addEventListener('click', addSection)
elements.addSlide.addEventListener('click', addSlide)
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
elements.slideIntent.addEventListener('change', async () => {
  if (!projection) return
  await executeStructural('slide.intent.set', {
    slideId: projection.slide.id,
    intent: elements.slideIntent.value,
  }, projection.slide.id)
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
