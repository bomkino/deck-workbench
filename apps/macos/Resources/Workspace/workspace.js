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
  renameDeck: document.querySelector('#rename-deck'),
  sequenceList: document.querySelector('#sequence-list'),
  addSection: document.querySelector('#add-section'),
  addSlide: document.querySelector('#add-slide'),
  headline: document.querySelector('#headline'),
  additionalContent: document.querySelector('#additional-content'),
  addBody: document.querySelector('#add-body'),
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
  const normalized = value.replace(/\r\n?/g, '\n')
  return {
    type: 'doc',
    content: normalized.split('\n').map((text) => ({
      type: 'paragraph',
      content: text.length > 0 ? [{ type: 'text', text }] : [],
    })),
  }
}

function storyShortcut(event, dirty) {
  if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return null
  if (event.key === 'Enter') return 'commit'
  if (event.key.toLowerCase() !== 'z' || dirty) return null
  return event.shiftKey ? 'redo' : 'undo'
}

function sequenceShortcut(event) {
  if (event.isComposing || !event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return null
  if (event.key === 'ArrowUp') return 'up'
  if (event.key === 'ArrowDown') return 'down'
  return null
}

function slideMovePlan(story, sectionId, slideId, direction) {
  if (!story || (direction !== 'up' && direction !== 'down')) return null
  const sectionIndex = story.sections.findIndex((section) => section.id === sectionId)
  if (sectionIndex < 0) return null
  const section = story.sections[sectionIndex]
  const slideIndex = section.slides.findIndex((slide) => slide.id === slideId)
  if (slideIndex < 0) return null

  if (direction === 'up') {
    if (slideIndex > 0) {
      return {
        slideId,
        targetSectionId: sectionId,
        afterSlideId: slideIndex > 1 ? section.slides[slideIndex - 2].id : null,
      }
    }
    const target = story.sections[sectionIndex - 1]
    if (!target) return null
    return { slideId, targetSectionId: target.id, afterSlideId: target.slides.at(-1)?.id ?? null }
  }

  if (slideIndex < section.slides.length - 1) {
    return { slideId, targetSectionId: sectionId, afterSlideId: section.slides[slideIndex + 1].id }
  }
  const target = story.sections[sectionIndex + 1]
  if (!target) return null
  return { slideId, targetSectionId: target.id, afterSlideId: null }
}

function setBusy(label) {
  elements.saveState.textContent = label
  elements.commit.disabled = true
  elements.undo.disabled = true
  elements.redo.disabled = true
  elements.addSection.disabled = true
  elements.addSlide.disabled = true
  elements.slideIntent.disabled = true
  elements.renameDeck.disabled = true
  elements.addBody.disabled = true
  elements.sequenceList.querySelectorAll('button').forEach((button) => { button.disabled = true })
  elements.additionalContent.querySelectorAll('button').forEach((button) => { button.disabled = true })
}

function renderProjection(next, options = {}) {
  projection = next
  elements.deckTitle.textContent = next.deckTitle
  elements.headline.disabled = false
  elements.headline.value = next.headline.plainText
  renderAdditionalContent(next.contentBlocks ?? [])
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
  elements.renameDeck.disabled = false
  elements.addBody.disabled = false
  elements.saveState.textContent = 'Durable and projected'
  applyScales()
  void refreshSequence(options.sequenceFocusSlideId ?? null)
  return next
}

function clearProjection() {
  projection = null
  storyDocument = null
  elements.deckTitle.textContent = 'No Deck open'
  elements.sequenceList.replaceChildren()
  elements.headline.value = ''
  elements.headline.disabled = true
  elements.additionalContent.replaceChildren()
  elements.artboardHeadline.textContent = 'No Deck open'
  elements.artboardIntent.textContent = '—'
  elements.revision.textContent = 'Revision —'
  elements.binding.textContent = '—'
  elements.commit.disabled = true
  elements.undo.disabled = true
  elements.redo.disabled = true
  elements.addSection.disabled = true
  elements.addSlide.disabled = true
  elements.slideIntent.disabled = true
  elements.renameDeck.disabled = true
  elements.addBody.disabled = true
  elements.saveState.textContent = 'No document session'
}

function renderAdditionalContent(blocks) {
  elements.additionalContent.replaceChildren()
  blocks.filter((block) => block.id !== projection?.headline.id).forEach((block) => {
    const field = document.createElement('label')
    field.className = 'content-field'
    const role = document.createElement('span')
    role.textContent = block.role
    const textarea = document.createElement('textarea')
    textarea.value = block.plainText
    textarea.rows = 4
    textarea.dataset.blockId = block.id
    textarea.setAttribute('aria-describedby', 'save-state')
    textarea.addEventListener('keydown', (event) => handleStoryFieldKeydown(event, block.id, textarea))
    const footer = document.createElement('footer')
    const key = document.createElement('span')
    key.textContent = block.semanticKey
    const commit = document.createElement('button')
    commit.type = 'button'
    commit.textContent = 'Commit'
    commit.addEventListener('click', () => updateContentBlock(block.id, textarea.value))
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = 'Remove'
    remove.className = 'remove-content'
    remove.setAttribute('aria-label', `Remove ${block.role} Content Block`)
    remove.addEventListener('click', () => removeContentBlock(block.id))
    const actions = document.createElement('div')
    actions.append(commit, remove)
    footer.append(key, actions)
    field.append(role, textarea, footer)
    elements.additionalContent.append(field)
  })
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
    if (section.slides.length === 0 && next.sections.length > 1) {
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'remove-structure'
      remove.textContent = '×'
      remove.setAttribute('aria-label', `Remove empty Section ${section.title}`)
      remove.addEventListener('click', () => removeSection(section.id))
      tools.append(remove)
    }
    sectionRow.append(tools)
    elements.sequenceList.append(sectionRow)

    section.slides.forEach((slide, slideIndex) => {
      const entry = document.createElement('div')
      entry.className = 'slide-entry'
      const select = document.createElement('button')
      select.type = 'button'
      select.className = `slide-row${projection?.slide.id === slide.id ? ' selected' : ''}`
      select.dataset.slideId = slide.id
      const number = document.createElement('span')
      number.className = 'slide-number'
      number.textContent = String(slideNumber).padStart(2, '0')
      const label = document.createElement('span')
      label.textContent = slide.headline?.plainText || slide.intent
      select.append(number, label)
      select.addEventListener('click', () => selectSlide(slide.id))
      select.addEventListener('keydown', (event) => moveSlideByKeyboard(event, section.id, slide.id))
      entry.append(select)
      const slideTools = document.createElement('span')
      slideTools.className = 'slide-tools'
      if (slideIndex > 0) {
        const move = document.createElement('button')
        move.type = 'button'
        move.className = 'move-up'
        move.textContent = '↑'
        move.setAttribute('aria-label', `Move Slide ${slideNumber} up`)
        move.addEventListener('click', () => moveSlideUp(section.id, slide.id))
        slideTools.append(move)
      }
      const totalSlides = next.sections.reduce((sum, candidate) => sum + candidate.slides.length, 0)
      if (totalSlides > 1) {
        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'remove-structure'
        remove.textContent = '×'
        remove.setAttribute('aria-label', `Remove Slide ${slideNumber}`)
        remove.addEventListener('click', () => removeSlide(slide.id))
        slideTools.append(remove)
      }
      if (slideTools.childElementCount > 0) entry.append(slideTools)
      elements.sequenceList.append(entry)
      slideNumber += 1
    })
  })
}

async function refreshSequence(focusSlideId = null) {
  try {
    renderSequence(await window.deckBridge.query({ name: 'story.document', params: {} }))
    if (focusSlideId) {
      elements.sequenceList.querySelector(`[data-slide-id="${CSS.escape(focusSlideId)}"]`)?.focus()
    }
  } catch {
    // No Deck is open yet; the native shell owns empty-document state.
  }
}

async function executeStructural(type, payload, selectedSlideId = projection?.slide.id, options = {}) {
  if (!projection) return
  setBusy(`Validating ${type}…`)
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: options.sourceKind ?? 'ui', label: 'Story document' },
        issuedAt: new Date().toISOString(),
      },
    })
    const next = await window.deckBridge.query({
      name: 'slide.activeProjection',
      params: selectedSlideId ? { slideId: selectedSlideId } : {},
    })
    renderProjection(next, { sequenceFocusSlideId: options.sequenceFocusSlideId })
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

async function removeSection(sectionId) {
  if (!storyDocument || !projection) return
  await executeStructural('section.remove', { sectionId }, projection.slide.id)
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

function moveSlideByKeyboard(event, sectionId, slideId) {
  const direction = sequenceShortcut(event)
  if (!direction) return
  const payload = slideMovePlan(storyDocument, sectionId, slideId, direction)
  if (!payload) return
  event.preventDefault()
  void executeStructural('slide.move', payload, slideId, {
    sourceKind: 'keyboard',
    sequenceFocusSlideId: slideId,
  })
}

async function removeSlide(slideId) {
  if (!storyDocument || !projection) return
  const orderedSlides = storyDocument.sections.flatMap((section) => section.slides)
  const removedIndex = orderedSlides.findIndex((slide) => slide.id === slideId)
  const remainingSlides = orderedSlides.filter((slide) => slide.id !== slideId)
  if (removedIndex < 0 || remainingSlides.length === 0) return
  const selectedSlideId = projection.slide.id === slideId
    ? remainingSlides[Math.min(removedIndex, remainingSlides.length - 1)].id
    : projection.slide.id
  await executeStructural('slide.remove', { slideId }, selectedSlideId)
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
  await updateContentBlock(projection.headline.id, elements.headline.value)
}

function storyField(blockId) {
  if (projection?.headline.id === blockId) return elements.headline
  return [...elements.additionalContent.querySelectorAll('textarea')]
    .find((textarea) => textarea.dataset.blockId === blockId)
}

function projectedPlainText(blockId) {
  return projection?.contentBlocks.find((block) => block.id === blockId)?.plainText
}

function restoreStoryFocus(blockId) {
  const field = storyField(blockId)
  if (!field) return false
  field.focus()
  field.setSelectionRange(field.value.length, field.value.length)
  return document.activeElement === field
}

async function updateContentBlock(blockId, value, options = {}) {
  if (!projection) return
  const { restoreFocus = false, sourceKind = 'ui' } = options
  const selectedSlideId = projection.slide.id
  setBusy('Validating and writing journal…')
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type: 'content.update',
        payload: {
          slideId: projection.slide.id,
          blockId,
          value: richText(value),
        },
        source: { kind: sourceKind, label: 'Story content' },
        issuedAt: new Date().toISOString(),
      },
    })
    renderProjection(await window.deckBridge.query({
      name: 'slide.activeProjection',
      params: { slideId: selectedSlideId },
    }))
    if (restoreFocus) restoreStoryFocus(blockId)
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    renderProjection(projection)
    if (restoreFocus) restoreStoryFocus(blockId)
  }
}

function handleStoryFieldKeydown(event, blockId, field) {
  const action = storyShortcut(event, field.value !== projectedPlainText(blockId))
  if (!action) return
  event.preventDefault()
  if (action === 'commit') {
    void updateContentBlock(blockId, field.value, { restoreFocus: true, sourceKind: 'keyboard' })
  } else {
    void historyAction(action, blockId)
  }
}

async function renameDeck() {
  if (!projection) return
  const title = window.prompt('Deck name', projection.deckTitle)?.trim()
  if (!title || title === projection.deckTitle) return
  await executeStructural('deck.rename', { title })
}

async function addBody() {
  if (!projection) return
  const blockId = crypto.randomUUID()
  await executeStructural('content.add', {
    slideId: projection.slide.id,
    blockId,
    semanticKey: `story.body.${blockId}`,
    role: 'body',
    value: richText('New Story body'),
    afterBlockId: projection.contentBlocks.at(-1)?.id ?? null,
  }, projection.slide.id)
}

async function removeContentBlock(blockId) {
  if (!projection) return
  await executeStructural('content.remove', {
    slideId: projection.slide.id,
    blockId,
  }, projection.slide.id)
}

async function historyAction(method, restoreFocusBlockId = null) {
  if (!projection) return
  const selectedSlideId = projection.slide.id
  setBusy(method === 'undo' ? 'Writing undo…' : 'Writing redo…')
  try {
    const result = await window.deckBridge[method]()
    let next = result.projection
    try {
      next = await window.deckBridge.query({
        name: 'slide.activeProjection',
        params: { slideId: selectedSlideId },
      })
    } catch {
      // The history operation may have removed the selected Slide; use the host fallback.
    }
    renderProjection(next)
    if (restoreFocusBlockId) restoreStoryFocus(restoreFocusBlockId)
  } catch (error) {
    elements.saveState.textContent = `${error.name ?? 'Error'}: ${error.message}`
    renderProjection(projection)
    if (restoreFocusBlockId) restoreStoryFocus(restoreFocusBlockId)
  }
}

elements.commit.addEventListener('click', commitHeadline)
elements.renameDeck.addEventListener('click', renameDeck)
elements.addBody.addEventListener('click', addBody)
elements.addSection.addEventListener('click', addSection)
elements.addSlide.addEventListener('click', addSlide)
elements.headline.addEventListener('keydown', (event) => {
  if (!projection) return
  handleStoryFieldKeydown(event, projection.headline.id, elements.headline)
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
  clearProjection,
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
