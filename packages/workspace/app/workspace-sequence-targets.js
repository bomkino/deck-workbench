const sequenceNodeRegistry = new Map()

function createSectionSequenceRow(sectionId) {
  const row = document.createElement('div')
  row.className = 'section-row'
  row.tabIndex = 0
  row.dataset.sectionId = sectionId
  row.setAttribute('role', 'group')
  row.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
  row.addEventListener('keydown', (event) => moveSectionByKeyboard(event, row.dataset.sectionId))
  const title = document.createElement('strong')
  title.dataset.sectionTitle = ''
  const tools = document.createElement('span')
  tools.className = 'section-tools'
  row.append(title, tools)
  return row
}

function updateSectionSequenceRow(row, section, story) {
  row.dataset.sectionId = section.id
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

function preventSequenceTargetMutation(event) {
  event.preventDefault()
}

function createSlideSequenceEntry(slideId) {
  const entry = document.createElement('div')
  entry.className = 'slide-entry'
  entry.dataset.sequenceSlideEntry = slideId

  const target = document.createElement('textarea')
  target.rows = 1
  target.wrap = 'off'
  target.autocomplete = 'off'
  target.spellcheck = false
  target.className = 'slide-focus-target'
  target.dataset.slideId = slideId
  target.value = 'Slide'
  target.tabIndex = 0
  target.setAttribute('aria-multiline', 'false')
  target.addEventListener('beforeinput', preventSequenceTargetMutation)
  target.addEventListener('paste', preventSequenceTargetMutation)
  target.addEventListener('drop', preventSequenceTargetMutation)
  target.addEventListener('input', (event) => {
    event.currentTarget.value = event.currentTarget.dataset.displayValue ?? 'Slide'
  })
  target.addEventListener('click', () => selectSlide(target.dataset.slideId))
  target.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void selectSlide(target.dataset.slideId)
      return
    }
    moveSlideByKeyboard(event, target.dataset.sectionId, target.dataset.slideId)
  })

  const visual = document.createElement('div')
  visual.className = 'slide-row'
  visual.tabIndex = -1
  visual.setAttribute('aria-hidden', 'true')
  visual.innerHTML = '<span class="slide-number"></span><span data-slide-label></span><span class="sequence-status"></span>'

  const tools = document.createElement('span')
  tools.className = 'slide-tools'
  entry.append(target, visual, tools)
  return entry
}

function updateSlideSequenceEntry(entry, section, slide, pageNumber, story) {
  const record = planRecordForSlide(slide, section)
  const readiness = planReadiness(record).state
  const target = entry.querySelector('.slide-focus-target')
  const visual = entry.querySelector('.slide-row')
  const tools = entry.querySelector('.slide-tools')
  const displayNumber = record.metadata.lifecycle === 'included' ? String(pageNumber).padStart(2, '0') : '—'
  const displayLabel = record.metadata.internalTitle || slide.headline?.plainText || slide.intent
  const displayValue = `${displayNumber}  ${displayLabel}  ${readiness.toUpperCase()}`

  entry.dataset.sequenceSlideEntry = slide.id
  target.dataset.slideId = slide.id
  target.dataset.sectionId = section.id
  target.dataset.displayValue = displayValue
  target.value = displayValue
  target.setAttribute('aria-label', `Slide ${pageNumber}: ${slide.headline?.plainText || slide.intent}`)
  target.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown')
  if (selectedSlideId === slide.id) target.setAttribute('aria-current', 'page')
  else target.removeAttribute('aria-current')
  if (record.metadata.lifecycle !== 'included') target.setAttribute('aria-disabled', 'true')
  else target.removeAttribute('aria-disabled')

  visual.className = `slide-row${selectedSlideId === slide.id ? ' selected' : ''}`
  visual.querySelector('.slide-number').textContent = displayNumber
  visual.querySelector('[data-slide-label]').textContent = displayLabel
  const status = visual.querySelector('.sequence-status')
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

function protectedSequenceNode() {
  const active = document.activeElement
  if (!active || !elements.sequenceList.contains(active)) return null
  return active.closest('.slide-entry')
    ?? (active.matches?.('[data-section-id]') ? active : null)
}

function reconcileSequenceOrder(desiredNodes, protectedNode) {
  const desired = new Set(desiredNodes)
  for (const child of [...elements.sequenceList.children]) {
    if (!desired.has(child)) {
      child.remove()
      for (const [key, node] of sequenceNodeRegistry) {
        if (node === child) sequenceNodeRegistry.delete(key)
      }
    }
  }
  for (const node of desiredNodes) {
    if (node.parentNode !== elements.sequenceList) elements.sequenceList.append(node)
  }
  let reference = null
  for (let index = desiredNodes.length - 1; index >= 0; index -= 1) {
    const node = desiredNodes[index]
    if (node !== protectedNode && node.nextSibling !== reference) {
      elements.sequenceList.insertBefore(node, reference)
    }
    reference = node
  }
}

function renderPersistentSequence(next) {
  if (!next) {
    elements.sequenceList.replaceChildren()
    sequenceNodeRegistry.clear()
    return
  }
  const protectedNode = protectedSequenceNode()
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

  reconcileSequenceOrder(desiredNodes, protectedNode)
}

renderSequence = renderPersistentSequence
