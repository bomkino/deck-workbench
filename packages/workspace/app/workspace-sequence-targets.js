const sequenceNodeRegistry = new Map()
let activeSequenceTarget = null
let sequenceFocusOwner = null

function sequenceDomToken(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '-')
}

function sequenceItemId(kind, id) {
  return `sequence-${kind}-${sequenceDomToken(id)}`
}

function preventSequenceOwnerMutation(event) {
  event.preventDefault()
}

function configureSequenceComposite() {
  sequenceFocusOwner = document.createElement('textarea')
  sequenceFocusOwner.id = 'sequence-focus-owner'
  sequenceFocusOwner.className = 'sequence-focus-owner'
  sequenceFocusOwner.rows = 1
  sequenceFocusOwner.wrap = 'off'
  sequenceFocusOwner.autocomplete = 'off'
  sequenceFocusOwner.spellcheck = false
  sequenceFocusOwner.value = 'Deck sequence'
  sequenceFocusOwner.setAttribute('role', 'tree')
  sequenceFocusOwner.setAttribute('aria-label', 'Deck sequence keyboard navigation')
  sequenceFocusOwner.setAttribute('aria-readonly', 'true')
  sequenceFocusOwner.setAttribute('aria-multiline', 'false')
  sequenceFocusOwner.setAttribute('inputmode', 'none')
  sequenceFocusOwner.addEventListener('beforeinput', preventSequenceOwnerMutation)
  sequenceFocusOwner.addEventListener('paste', preventSequenceOwnerMutation)
  sequenceFocusOwner.addEventListener('drop', preventSequenceOwnerMutation)
  sequenceFocusOwner.addEventListener('input', () => updateSequenceActivePresentation())
  sequenceFocusOwner.addEventListener('keydown', handleSequenceCompositeKeydown)
  elements.sequenceList.parentElement.insertBefore(sequenceFocusOwner, elements.sequenceList)
  elements.sequenceList.setAttribute('role', 'group')
  elements.sequenceList.setAttribute('aria-label', 'Deck sequence items')
}

function sequenceFocusElement() {
  return sequenceFocusOwner
}

function sequenceTargetNode(kind, id) {
  return [...elements.sequenceList.querySelectorAll('[data-sequence-kind]')]
    .find((node) => node.dataset.sequenceKind === kind && node.dataset.sequenceId === id) ?? null
}

function sequenceTargetLabel(node) {
  if (!node) return 'Deck sequence'
  const kind = node.dataset.sequenceKind === 'section' ? 'Part' : 'Slide'
  return `${kind}: ${node.getAttribute('aria-label') ?? node.textContent?.trim() ?? node.dataset.sequenceId}`
}

function sequenceFocusState() {
  return Object.freeze({
    kind: activeSequenceTarget?.kind ?? null,
    id: activeSequenceTarget?.id ?? null,
    ownerFocused: document.activeElement === sequenceFocusOwner,
    activeDescendant: sequenceFocusOwner?.getAttribute('aria-activedescendant') ?? null,
  })
}

function updateSequenceActivePresentation() {
  if (!sequenceFocusOwner) return
  const activeNode = activeSequenceTarget
    ? sequenceTargetNode(activeSequenceTarget.kind, activeSequenceTarget.id)
    : null
  const ownedIds = [...elements.sequenceList.querySelectorAll('[data-sequence-kind]')]
    .map((node) => node.id)
    .filter(Boolean)
  if (ownedIds.length) sequenceFocusOwner.setAttribute('aria-owns', ownedIds.join(' '))
  else sequenceFocusOwner.removeAttribute('aria-owns')
  if (activeNode) sequenceFocusOwner.setAttribute('aria-activedescendant', activeNode.id)
  else sequenceFocusOwner.removeAttribute('aria-activedescendant')
  sequenceFocusOwner.value = sequenceTargetLabel(activeNode)
  sequenceFocusOwner.setSelectionRange(0, 0)
  for (const node of elements.sequenceList.querySelectorAll('[data-sequence-kind]')) {
    const active = node === activeNode
    node.dataset.sequenceActive = String(active)
    node.setAttribute('aria-selected', String(active))
  }
}

function focusSequenceTarget(target, options = {}) {
  const kind = target?.kind
  const id = target?.id
  if (!['slide', 'section'].includes(kind) || !id || !sequenceFocusOwner) return false
  const node = sequenceTargetNode(kind, id)
  if (!node) return false
  activeSequenceTarget = { kind, id, sectionId: node.dataset.sectionId ?? null }
  updateSequenceActivePresentation()
  if (options.focus !== false) {
    try {
      sequenceFocusOwner.focus({ preventScroll: true })
    } catch {
      sequenceFocusOwner.focus()
    }
  }
  return document.activeElement === sequenceFocusOwner
    && sequenceFocusOwner.getAttribute('aria-activedescendant') === node.id
}

function semanticSequenceItems() {
  return [...elements.sequenceList.querySelectorAll('[data-sequence-kind]')]
}

function moveSequenceActiveTarget(direction) {
  const items = semanticSequenceItems()
  if (!items.length) return
  const current = activeSequenceTarget
    ? items.findIndex((node) => node.dataset.sequenceKind === activeSequenceTarget.kind && node.dataset.sequenceId === activeSequenceTarget.id)
    : -1
  const nextIndex = direction === 'first'
    ? 0
    : direction === 'last'
      ? items.length - 1
      : Math.max(0, Math.min(items.length - 1, current + (direction === 'previous' ? -1 : 1)))
  const next = items[nextIndex]
  if (!next) return
  focusSequenceTarget({ kind: next.dataset.sequenceKind, id: next.dataset.sequenceId })
  if (next.dataset.sequenceKind === 'slide') void selectSlide(next.dataset.sequenceId)
}

function activateSequenceTarget() {
  if (activeSequenceTarget?.kind === 'slide') void selectSlide(activeSequenceTarget.id)
}

function handleSequenceCompositeKeydown(event) {
  if (event.target !== sequenceFocusOwner) return
  if (event.altKey && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
    if (activeSequenceTarget?.kind === 'slide') {
      moveSlideByKeyboard(event, activeSequenceTarget.sectionId, activeSequenceTarget.id)
      return
    }
    if (activeSequenceTarget?.kind === 'section') {
      moveSectionByKeyboard(event, activeSequenceTarget.id)
      return
    }
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveSequenceActiveTarget('previous')
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveSequenceActiveTarget('next')
  } else if (event.key === 'Home') {
    event.preventDefault()
    moveSequenceActiveTarget('first')
  } else if (event.key === 'End') {
    event.preventDefault()
    moveSequenceActiveTarget('last')
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activateSequenceTarget()
  }
}

function createSectionSequenceRow(sectionId) {
  const row = document.createElement('div')
  row.className = 'section-row'
  row.id = sequenceItemId('section', sectionId)
  row.dataset.sectionId = sectionId
  row.dataset.sequenceKind = 'section'
  row.dataset.sequenceId = sectionId
  row.setAttribute('role', 'treeitem')
  row.setAttribute('aria-level', '1')
  row.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
  row.addEventListener('click', (event) => {
    if (event.target.closest('button')) return
    focusSequenceTarget({ kind: 'section', id: row.dataset.sectionId })
  })
  const title = document.createElement('strong')
  title.dataset.sectionTitle = ''
  const tools = document.createElement('span')
  tools.className = 'section-tools'
  row.append(title, tools)
  return row
}

function updateSectionSequenceRow(row, section, story) {
  row.id = sequenceItemId('section', section.id)
  row.dataset.sectionId = section.id
  row.dataset.sequenceId = section.id
  row.setAttribute('aria-label', `${section.title} Section`)
  row.querySelector('[data-section-title]').textContent = section.title
  const tools = row.querySelector('.section-tools')
  tools.replaceChildren()

  const rename = document.createElement('button')
  rename.type = 'button'
  rename.textContent = 'Rename'
  rename.setAttribute('aria-label', `Rename ${section.title}`)
  rename.addEventListener('click', () => renameSection(section.id, section.title))
  tools.append(rename)

  const plans = sequenceControlPlans(story, section.id)
  for (const direction of ['up', 'down']) {
    if (!plans[direction]) continue
    const move = document.createElement('button')
    move.type = 'button'
    move.className = 'move-sequence'
    move.dataset.direction = direction
    move.textContent = direction === 'up' ? '↑' : '↓'
    move.setAttribute('aria-label', `Move ${section.title} ${direction}`)
    move.addEventListener('click', () => moveSection(section.id, direction))
    tools.append(move)
  }

  if (section.slides.length === 0 && story.sections.length > 1) {
    const remove = document.createElement('button')
    remove.type = 'button'
    remove.textContent = '×'
    remove.setAttribute('aria-label', `Remove empty Section ${section.title}`)
    remove.addEventListener('click', () => removeSection(section.id))
    tools.append(remove)
  }
}

function createSlideSequenceEntry(slideId) {
  const entry = document.createElement('div')
  entry.className = 'slide-entry'
  entry.dataset.sequenceSlideEntry = slideId

  const row = document.createElement('div')
  row.className = 'slide-row'
  row.id = sequenceItemId('slide', slideId)
  row.dataset.slideId = slideId
  row.dataset.sequenceKind = 'slide'
  row.dataset.sequenceId = slideId
  row.setAttribute('role', 'treeitem')
  row.setAttribute('aria-level', '2')
  row.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
  row.innerHTML = '<span class="slide-number"></span><span data-slide-label></span><span class="sequence-status"></span>'
  row.addEventListener('click', () => {
    focusSequenceTarget({ kind: 'slide', id: row.dataset.slideId })
    void selectSlide(row.dataset.slideId)
  })

  const tools = document.createElement('span')
  tools.className = 'slide-tools'
  entry.append(row, tools)
  return entry
}

function updateSlideSequenceEntry(entry, section, slide, pageNumber, story) {
  const record = planRecordForSlide(slide, section)
  const readiness = planReadiness(record).state
  const row = entry.querySelector('.slide-row')
  const tools = entry.querySelector('.slide-tools')
  const displayNumber = record.metadata.lifecycle === 'included' ? String(pageNumber).padStart(2, '0') : '—'
  const displayLabel = record.metadata.internalTitle || slide.headline?.plainText || slide.intent

  entry.dataset.sequenceSlideEntry = slide.id
  row.id = sequenceItemId('slide', slide.id)
  row.dataset.slideId = slide.id
  row.dataset.sequenceId = slide.id
  row.dataset.sectionId = section.id
  row.setAttribute('aria-label', `Slide ${pageNumber}: ${slide.headline?.plainText || slide.intent}`)
  if (selectedSlideId === slide.id) row.setAttribute('aria-current', 'page')
  else row.removeAttribute('aria-current')
  if (record.metadata.lifecycle !== 'included') row.setAttribute('aria-disabled', 'true')
  else row.removeAttribute('aria-disabled')

  row.className = `slide-row${selectedSlideId === slide.id ? ' selected' : ''}`
  row.querySelector('.slide-number').textContent = displayNumber
  row.querySelector('[data-slide-label]').textContent = displayLabel
  const status = row.querySelector('.sequence-status')
  status.className = `sequence-status ${readiness}`
  status.textContent = readiness

  tools.replaceChildren()
  const plans = sequenceControlPlans(story, section.id, slide.id)
  for (const direction of ['up', 'down']) {
    if (!plans[direction]) continue
    const move = document.createElement('button')
    move.type = 'button'
    move.className = 'move-sequence'
    move.dataset.direction = direction
    move.textContent = direction === 'up' ? '↑' : '↓'
    move.setAttribute('aria-label', `Move Slide ${pageNumber} ${direction}`)
    move.addEventListener('click', () => moveSlide(section.id, slide.id, direction))
    tools.append(move)
  }
}

function reconcileSequenceOrder(desiredNodes) {
  const desired = new Set(desiredNodes)
  for (const child of [...elements.sequenceList.children]) {
    if (!desired.has(child)) {
      child.remove()
      for (const [key, node] of sequenceNodeRegistry) {
        if (node === child) sequenceNodeRegistry.delete(key)
      }
    }
  }
  for (let index = 0; index < desiredNodes.length; index += 1) {
    const node = desiredNodes[index]
    const current = elements.sequenceList.children[index]
    if (current !== node) elements.sequenceList.insertBefore(node, current ?? null)
  }
}

function renderPersistentSequence(next) {
  if (!next) {
    elements.sequenceList.replaceChildren()
    sequenceNodeRegistry.clear()
    activeSequenceTarget = null
    updateSequenceActivePresentation()
    return
  }
  const desiredNodes = []
  let pageNumber = 1

  for (const section of next.sections) {
    const sectionKey = `section:${section.id}`
    let sectionRow = sequenceNodeRegistry.get(sectionKey)
    if (!sectionRow) {
      sectionRow = createSectionSequenceRow(section.id)
      sequenceNodeRegistry.set(sectionKey, sectionRow)
    }
    updateSectionSequenceRow(sectionRow, section, next)
    desiredNodes.push(sectionRow)

    for (const slide of section.slides) {
      const slideKey = `slide:${slide.id}`
      let entry = sequenceNodeRegistry.get(slideKey)
      if (!entry) {
        entry = createSlideSequenceEntry(slide.id)
        sequenceNodeRegistry.set(slideKey, entry)
      }
      updateSlideSequenceEntry(entry, section, slide, pageNumber, next)
      desiredNodes.push(entry)
      const record = planRecordForSlide(slide, section)
      if (record.metadata.lifecycle === 'included') pageNumber += 1
    }
  }

  reconcileSequenceOrder(desiredNodes)
  const activeStillExists = activeSequenceTarget
    && sequenceTargetNode(activeSequenceTarget.kind, activeSequenceTarget.id)
  if (!activeStillExists) {
    const selected = selectedSlideId ? sequenceTargetNode('slide', selectedSlideId) : null
    const fallback = selected ?? elements.sequenceList.querySelector('[data-sequence-kind="slide"], [data-sequence-kind="section"]')
    activeSequenceTarget = fallback
      ? { kind: fallback.dataset.sequenceKind, id: fallback.dataset.sequenceId, sectionId: fallback.dataset.sectionId ?? null }
      : null
  } else if (activeSequenceTarget.kind === 'slide') {
    activeSequenceTarget.sectionId = sequenceTargetNode('slide', activeSequenceTarget.id)?.dataset.sectionId ?? null
  }
  updateSequenceActivePresentation()
}

configureSequenceComposite()
renderSequence = renderPersistentSequence
