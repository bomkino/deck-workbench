let workspaceFocusLease = 0
let workspaceInteractionGeneration = 0
let workspaceExpectedFocus = null
let workspaceExpectedFocusGeneration = 0
let applyingWorkspaceFocus = false

function workspaceFocusTarget(active) {
  if (!active || active === document.body || active === document.documentElement) return null
  const slideId = active?.dataset?.slideId
    ?? active?.closest?.('.slide-entry')?.querySelector?.('[data-slide-id]')?.dataset?.slideId
    ?? null
  const sectionId = active?.dataset?.sectionId
    ?? active?.closest?.('[data-section-id]')?.dataset?.sectionId
    ?? null
  const blockId = active?.dataset?.blockId ?? null
  const headline = active === elements.headline
  if (!slideId && !sectionId && !blockId && !headline) return null
  return {
    slideId,
    sectionId,
    blockId,
    headline,
    selectionStart: typeof active?.selectionStart === 'number' ? active.selectionStart : null,
    selectionEnd: typeof active?.selectionEnd === 'number' ? active.selectionEnd : null,
  }
}

function captureWorkspaceFocus() {
  return workspaceFocusTarget(document.activeElement)
}

function rememberWorkspaceFocus(target) {
  if (!target) return
  workspaceExpectedFocus = { ...target }
  workspaceExpectedFocusGeneration = workspaceInteractionGeneration
}

function expectedWorkspaceFocus() {
  return workspaceExpectedFocusGeneration === workspaceInteractionGeneration
    ? workspaceExpectedFocus
    : null
}

function installDelegatedFocusHost(node) {
  if (!node || node.shadowRoot || typeof node.attachShadow !== 'function') return node
  const shadow = node.attachShadow({ mode: 'open', delegatesFocus: true })
  const style = document.createElement('style')
  style.textContent = `
    :host { position: relative; }
    input {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      min-inline-size: 1px;
      min-block-size: 1px;
      inset: 0 auto auto 0;
      margin: 0;
      padding: 0;
      border: 0;
      opacity: 0;
      pointer-events: none;
    }
    slot { display: contents; }
  `
  const proxy = document.createElement('input')
  proxy.type = 'text'
  proxy.readOnly = true
  proxy.tabIndex = 0
  proxy.className = 'sequence-focus-proxy'
  proxy.autocomplete = 'off'
  proxy.spellcheck = false
  proxy.setAttribute('aria-label', node.getAttribute('aria-label') ?? 'Sequence focus target')
  const slot = document.createElement('slot')
  shadow.append(style, proxy, slot)
  const focusProxy = (options) => {
    try {
      proxy.focus(options)
    } catch {
      proxy.focus()
    }
  }
  Object.defineProperty(node, 'focus', {
    configurable: true,
    enumerable: false,
    value: focusProxy,
  })
  return node
}

function makeWorkspaceNodeFocusable(node) {
  if (!node) return null
  if (node.matches?.('[data-slide-id], [data-section-id]')) {
    node.tabIndex = 0
    if (node.tagName !== 'BUTTON') installDelegatedFocusHost(node)
  }
  return node
}

function replaceNativeSlideButton(button, sectionId) {
  const slideId = button.dataset.slideId
  if (!slideId || !sectionId) return button
  const row = document.createElement('div')
  for (const attribute of button.attributes) {
    if (attribute.name !== 'type') row.setAttribute(attribute.name, attribute.value)
  }
  row.setAttribute('role', 'button')
  row.tabIndex = 0
  while (button.firstChild) row.append(button.firstChild)
  row.addEventListener('click', () => selectSlide(slideId))
  row.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      void selectSlide(slideId)
      return
    }
    moveSlideByKeyboard(event, sectionId, slideId)
  })
  button.replaceWith(row)
  return installDelegatedFocusHost(row)
}

function ensureSequenceKeyboardFocusability() {
  let sectionId = null
  for (const child of elements.sequenceList.children) {
    if (child.matches?.('[data-section-id]')) {
      sectionId = child.dataset.sectionId
      child.tabIndex = 0
      installDelegatedFocusHost(child)
      continue
    }
    const button = child.querySelector?.('button.slide-row[data-slide-id]')
    if (button) replaceNativeSlideButton(button, sectionId)
  }
}

function workspaceFocusNode(target) {
  if (!target) return null
  let node = null
  if (target.blockId) node = storyField(target.blockId)
  else if (target.headline) node = elements.headline
  else if (target.slideId) {
    node = [...elements.sequenceList.querySelectorAll('[data-slide-id]')]
      .find((candidate) => candidate.dataset.slideId === target.slideId) ?? null
  } else if (target.sectionId) {
    node = [...elements.sequenceList.querySelectorAll('[data-section-id]')]
      .find((candidate) => candidate.dataset.sectionId === target.sectionId) ?? null
  }
  return makeWorkspaceNodeFocusable(node)
}

function focusWorkspaceNode(node, target) {
  node = makeWorkspaceNodeFocusable(node)
  if (!node || node.disabled || !node.isConnected) return false
  applyingWorkspaceFocus = true
  try {
    node.focus({ preventScroll: true })
    if (
      target.selectionStart !== null
      && target.selectionStart !== undefined
      && target.selectionEnd !== null
      && target.selectionEnd !== undefined
      && typeof node.setSelectionRange === 'function'
    ) {
      const maximum = node.value?.length ?? 0
      node.setSelectionRange(
        Math.min(target.selectionStart, maximum),
        Math.min(target.selectionEnd, maximum),
      )
    }
  } finally {
    applyingWorkspaceFocus = false
  }
  const restored = document.activeElement === node
  if (restored) rememberWorkspaceFocus(target)
  return restored
}

function cancelWorkspaceFocusLease() {
  workspaceFocusLease += 1
}

function recordTrustedWorkspaceInteraction(event) {
  if (!event.isTrusted) return
  workspaceInteractionGeneration += 1
  workspaceExpectedFocus = null
  workspaceExpectedFocusGeneration = workspaceInteractionGeneration
  cancelWorkspaceFocusLease()
}

document.addEventListener('pointerdown', recordTrustedWorkspaceInteraction, true)
document.addEventListener('keydown', recordTrustedWorkspaceInteraction, true)
document.addEventListener('focusin', (event) => {
  if (applyingWorkspaceFocus) return
  const target = workspaceFocusTarget(event.target)
  if (target) rememberWorkspaceFocus(target)
}, true)

function scheduleWorkspaceFocusLease(target) {
  if (!target) return
  rememberWorkspaceFocus(target)
  const leaseId = ++workspaceFocusLease
  const interactionGeneration = workspaceInteractionGeneration
  const delays = [0, 16, 64, 250, 1000, 2000, 4000]
  for (const delay of delays) {
    globalThis.setTimeout(() => {
      if (
        leaseId !== workspaceFocusLease
        || interactionGeneration !== workspaceInteractionGeneration
      ) return
      const expected = expectedWorkspaceFocus() ?? target
      const node = workspaceFocusNode(expected)
      if (!node || document.activeElement === node) return
      focusWorkspaceNode(node, expected)
    }, delay)
  }
}

function restoreWorkspaceFocus(target, { lease = false } = {}) {
  if (!target) return false
  const restored = focusWorkspaceNode(workspaceFocusNode(target), target)
  if (lease) scheduleWorkspaceFocusLease(target)
  return restored
}

const renderSequenceWithoutFocusPreservation = renderSequence
renderSequence = function renderSequenceWithFocusPreservation(next) {
  const target = captureWorkspaceFocus() ?? expectedWorkspaceFocus()
  renderSequenceWithoutFocusPreservation(next)
  ensureSequenceKeyboardFocusability()
  restoreWorkspaceFocus(target)
}

const renderPlanEditorWithoutFocusPreservation = renderPlanEditor
renderPlanEditor = function renderPlanEditorWithFocusPreservation() {
  const target = captureWorkspaceFocus() ?? expectedWorkspaceFocus()
  renderPlanEditorWithoutFocusPreservation()
  restoreWorkspaceFocus(target)
}

const nativeDeckBridge = window.deckBridge
window.deckBridge = Object.freeze({
  ...nativeDeckBridge,
  async query(payload = {}) {
    const interactionGeneration = workspaceInteractionGeneration
    const target = captureWorkspaceFocus() ?? expectedWorkspaceFocus()
    try {
      return await nativeDeckBridge.query(payload)
    } finally {
      if (interactionGeneration === workspaceInteractionGeneration) {
        restoreWorkspaceFocus(target, { lease: true })
      }
    }
  },
})

async function executeSequenceMove(type, payload, requestedSlideId, focus, sourceKind) {
  if (!projection) return null
  setBusy(`Writing ${type}…`)
  try {
    await window.deckBridge.execute({
      command: {
        commandId: crypto.randomUUID(),
        expectedRevision: projection.revision,
        type,
        payload,
        source: { kind: sourceKind, label: 'Sequence reorder' },
        issuedAt: new Date().toISOString(),
      },
    })
    const nextProjection = await window.deckBridge.query({
      name: 'slide.activeProjection',
      params: requestedSlideId ? { slideId: requestedSlideId } : {},
    })
    const nextStory = await window.deckBridge.query({ name: 'story.document', params: {} })
    projection = nextProjection
    selectedSlideId = nextProjection.slide.id
    storyDocument = nextStory
    renderAll()
    restoreWorkspaceFocus(focus, { lease: true })
    return projection
  } catch (error) {
    renderAll()
    setStatus(`${error.name ?? 'Error'}: ${error.message}`)
    return null
  }
}

async function planSlideMove(sectionId, slideId, direction, sourceKind) {
  const canonicalStory = await window.deckBridge.query({ name: 'story.document', params: {} })
  storyDocument = canonicalStory
  const payload = slideMovePlan(canonicalStory, sectionId, slideId, direction)
  if (!payload) {
    setStatus(`Slide cannot move ${direction}`)
    restoreWorkspaceFocus({ slideId }, { lease: true })
    return null
  }
  return executeSequenceMove('slide.move', payload, slideId, { slideId }, sourceKind)
}

async function planSectionMove(sectionId, direction, sourceKind) {
  const canonicalStory = await window.deckBridge.query({ name: 'story.document', params: {} })
  storyDocument = canonicalStory
  const payload = sectionMovePlan(canonicalStory, sectionId, direction)
  if (!payload) {
    setStatus(`Part cannot move ${direction}`)
    restoreWorkspaceFocus({ sectionId }, { lease: true })
    return null
  }
  return executeSequenceMove('section.move', payload, selectedSlideId, { sectionId }, sourceKind)
}

moveSlide = async function moveSlideFromCanonicalStory(sectionId, slideId, direction) {
  await planSlideMove(sectionId, slideId, direction, 'ui')
}

moveSlideByKeyboard = function moveSlideByKeyboardFromCanonicalStory(event, sectionId, slideId) {
  const direction = sequenceShortcut(event)
  if (!direction) return
  event.preventDefault()
  void planSlideMove(sectionId, slideId, direction, 'keyboard')
}

moveSection = async function moveSectionFromCanonicalStory(sectionId, direction) {
  await planSectionMove(sectionId, direction, 'ui')
}

moveSectionByKeyboard = function moveSectionByKeyboardFromCanonicalStory(event, sectionId) {
  if (event.target !== event.currentTarget) return
  const direction = sequenceShortcut(event)
  if (!direction) return
  event.preventDefault()
  void planSectionMove(sectionId, direction, 'keyboard')
}
