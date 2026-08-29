const freeze = (value) => Object.freeze(value)

export const WORKBENCH_PHASES = freeze(['plan', 'curate', 'assemble', 'handoff'])
export const COPY_FIELD_STATES = freeze(['unreviewed', 'intentionally-blank', 'present'])
export const TEXT_PRESENCE = freeze(['visible', 'no-on-slide-text', 'undecided'])
export const SLIDE_LIFECYCLES = freeze(['included', 'skipped', 'cut'])
export const CONTENT_PATTERNS = freeze([
  'simple-copy',
  'quote',
  'repeater',
  'comparison',
  'gallery-captions',
  'no-on-slide-text',
  'custom',
])
export const TYPE_SCALE_TOKENS = freeze(['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL'])

export const VISUAL_STYLE_DEFINITIONS = freeze({
  undecided: freeze({ label: 'Undecided', mediaSlots: 0, allowsText: true }),
  'text-only': freeze({ label: 'Text Only', mediaSlots: 0, allowsText: true }),
  'full-bleed': freeze({ label: 'Full Bleed', mediaSlots: 1, allowsText: true }),
  'full-bleed-overlay': freeze({ label: 'Full Bleed + Overlay', mediaSlots: 1, allowsText: true }),
  'image-text': freeze({ label: 'Image + Text', mediaSlots: 1, allowsText: true }),
  diptych: freeze({ label: 'Diptych', mediaSlots: 2, allowsText: true }),
  triptych: freeze({ label: 'Triptych', mediaSlots: 3, allowsText: true }),
  gallery: freeze({ label: 'Gallery', mediaSlots: 'variable', allowsText: true }),
  custom: freeze({ label: 'Custom', mediaSlots: 'variable', allowsText: true }),
})

export const MEDIA_DECISION_STATES = freeze([
  'considered',
  'shortlisted',
  'selected',
  'alternate',
  'rejected-for-slide',
])

export function copyField(state = 'unreviewed', markdown = '') {
  if (!COPY_FIELD_STATES.includes(state)) throw new RangeError(`Unknown copy field state: ${state}`)
  if (state === 'present') {
    if (typeof markdown !== 'string') throw new TypeError('Copy markdown must be a string')
    return freeze({ state, markdown })
  }
  return freeze({ state })
}

export function copyFieldText(field) {
  return field?.state === 'present' ? String(field.markdown ?? '') : ''
}

export function slideHasVisibleCopy(slide) {
  if (slide?.textPresence === 'no-on-slide-text') return false
  const copy = slide?.copy ?? {}
  return ['headline', 'subheadline', 'body'].some((role) => copyFieldText(copy[role]).trim().length > 0)
}

export function requiredMediaSlots(slide) {
  const style = VISUAL_STYLE_DEFINITIONS[slide?.visualStyle ?? 'undecided']
  if (!style) throw new RangeError(`Unknown visual style: ${slide?.visualStyle}`)
  if (style.mediaSlots === 'variable') {
    const requested = Number(slide?.mediaSlotCount ?? 0)
    return Number.isInteger(requested) && requested >= 0 ? requested : 0
  }
  return style.mediaSlots
}

export function supportingItemSlotKeys(slide) {
  if (slide?.contentPattern !== 'repeater') return []
  return (slide.supportingItems ?? []).map((item) => `item:${item.id}:media`)
}

export function primarySlotKeys(slide) {
  const named = supportingItemSlotKeys(slide)
  if (named.length > 0) return named
  return Array.from({ length: requiredMediaSlots(slide) }, (_, index) => `primary:${index + 1}`)
}

export function planIssues(slide) {
  if (!slide || slide.lifecycle !== 'included') return []
  const issues = []
  if (!String(slide.internalTitle ?? '').trim()) issues.push(issue('plan.internal-title', 'Internal title is missing', 'blocker'))
  if (!String(slide.purpose ?? '').trim()) issues.push(issue('plan.purpose', 'Purpose is missing', 'blocker'))
  if (slide.textPresence === 'undecided') issues.push(issue('plan.text-presence', 'Text presence is undecided', 'blocker'))
  if (!CONTENT_PATTERNS.includes(slide.contentPattern)) issues.push(issue('plan.content-pattern', 'Content Pattern is invalid', 'blocker'))
  if (!VISUAL_STYLE_DEFINITIONS[slide.visualStyle] || slide.visualStyle === 'undecided') {
    issues.push(issue('plan.visual-style', 'Visual Style is undecided', 'blocker'))
  }

  if (slide.textPresence === 'visible') {
    const fields = slide.copy ?? {}
    const present = ['headline', 'subheadline', 'body'].filter((role) => fields[role]?.state === 'present')
    const unreviewed = ['headline', 'subheadline', 'body'].filter((role) => fields[role]?.state === 'unreviewed')
    if (present.length === 0) issues.push(issue('plan.copy-empty', 'Visible text is selected but no copy is present', 'blocker'))
    if (unreviewed.length > 0) issues.push(issue('plan.copy-unreviewed', `${unreviewed.length} copy field${unreviewed.length === 1 ? '' : 's'} remain unreviewed`, 'warning'))
  }

  if (slide.contentPattern === 'repeater') {
    if ((slide.supportingItems ?? []).length === 0) issues.push(issue('plan.repeater-empty', 'Repeater has no items', 'blocker'))
    for (const item of slide.supportingItems ?? []) {
      if (!String(item.title ?? '').trim()) issues.push(issue(`plan.item-title:${item.id}`, 'A repeated item has no title', 'warning'))
    }
  }
  return issues
}

export function curateIssues(slide, mediaDecisions = {}) {
  if (!slide || slide.lifecycle !== 'included') return []
  const issues = []
  const slots = primarySlotKeys(slide)
  for (const slot of slots) {
    const selected = Object.values(mediaDecisions).find((decision) => decision?.state === 'selected' && decision.slotKey === slot)
    if (!selected) issues.push(issue(`curate.slot:${slot}`, `Media slot ${slotLabel(slot, slide)} is empty`, 'blocker'))
    else if (selected.availability && selected.availability !== 'available') {
      issues.push(issue(`curate.missing:${slot}`, `Selected media for ${slotLabel(slot, slide)} is ${selected.availability}`, 'blocker'))
    }
  }

  const findMore = slide.findMoreMedia ?? { state: 'not-needed', brief: '' }
  if (findMore.state === 'needed') {
    issues.push(issue('curate.find-more', 'Find More Media remains open', 'warning'))
    if (!String(findMore.brief ?? '').trim()) issues.push(issue('curate.find-more-brief', 'Find More Media needs a brief', 'warning'))
  }
  return issues
}

export function assemblyIssues(slide) {
  if (!slide || slide.lifecycle !== 'included') return []
  const issues = []
  const assembly = slide.assemblies?.find((candidate) => candidate.id === slide.activeAssemblyId)
  if (!assembly) {
    issues.push(issue('assembly.missing', 'No active Assembly exists', 'blocker'))
    return issues
  }
  if (slide.copyReviewState === 'changed-after-assembly') {
    issues.push(issue('assembly.copy-changed', 'Copy changed after Assembly', 'warning'))
  }
  if (slide.layoutReviewState === 'changed-after-curation') {
    issues.push(issue('assembly.layout-changed', 'Visual Style changed after media selection', 'warning'))
  }
  if (assembly.text?.overflow) issues.push(issue('assembly.text-overflow', 'Text overflows its frame', 'warning'))
  if (assembly.text?.layoutSnapshotState === 'stale') issues.push(issue('assembly.text-snapshot', 'Text Layout Snapshot is stale', 'warning'))
  if ((assembly.unplacedAssetIds ?? []).length > 0) issues.push(issue('assembly.unplaced-media', 'Assembly contains unplaced media', 'warning'))
  return issues
}

export function handoffIssues(slide, mediaDecisions = {}) {
  return [...planIssues(slide), ...curateIssues(slide, mediaDecisions), ...assemblyIssues(slide)]
}

export function slideReadiness(slide, mediaDecisions = {}) {
  const plan = planIssues(slide)
  const curate = curateIssues(slide, mediaDecisions)
  const assemble = assemblyIssues(slide)
  return freeze({
    plan: readiness(plan),
    curate: readiness(curate),
    assemble: readiness(assemble),
    handoff: readiness([...plan, ...curate, ...assemble]),
  })
}

export function transitionMediaDecision(current, action, slotKey = null) {
  const base = current ?? freeze({ state: 'considered', slotKey: null })
  const validActions = new Set([
    'shortlist',
    'select',
    'alternate',
    'reject',
    'clear',
    'demote-to-shortlist',
    'demote-to-alternate',
  ])
  if (!validActions.has(action)) throw new RangeError(`Unknown media decision action: ${action}`)
  switch (action) {
    case 'shortlist': return freeze({ ...base, state: 'shortlisted', slotKey: null })
    case 'select':
      if (!slotKey) throw new TypeError('Selecting media requires a slot key')
      return freeze({ ...base, state: 'selected', slotKey })
    case 'alternate': return freeze({ ...base, state: 'alternate', slotKey: null })
    case 'reject': return freeze({ ...base, state: 'rejected-for-slide', slotKey: null })
    case 'clear': return freeze({ ...base, state: 'considered', slotKey: null })
    case 'demote-to-shortlist': return freeze({ ...base, state: 'shortlisted', slotKey: null })
    case 'demote-to-alternate': return freeze({ ...base, state: 'alternate', slotKey: null })
    default: throw new Error('Unreachable media transition')
  }
}

export function createPitchGrid({
  width = 2576,
  height = 1080,
  columns = 24,
  rows = 12,
  marginX = 96,
  marginY = 64,
  gutterX = 16,
  gutterY = 8,
} = {}) {
  for (const [name, value] of Object.entries({ width, height, columns, rows, marginX, marginY, gutterX, gutterY })) {
    if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative finite number`)
  }
  if (!Number.isInteger(columns) || columns < 1 || !Number.isInteger(rows) || rows < 1) {
    throw new RangeError('Grid rows and columns must be positive integers')
  }
  const usableWidth = width - 2 * marginX - (columns - 1) * gutterX
  const usableHeight = height - 2 * marginY - (rows - 1) * gutterY
  if (usableWidth <= 0 || usableHeight <= 0) throw new RangeError('Grid margins and gutters exceed the canvas')
  const cellWidth = usableWidth / columns
  const cellHeight = usableHeight / rows
  const xLines = new Set([0, width, width / 2, marginX, width - marginX])
  const yLines = new Set([0, height, height / 2, marginY, height - marginY])
  const cells = []
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = marginX + column * (cellWidth + gutterX)
      const y = marginY + row * (cellHeight + gutterY)
      cells.push(freeze({ row, column, x, y, width: cellWidth, height: cellHeight }))
      xLines.add(x)
      xLines.add(x + cellWidth)
      yLines.add(y)
      yLines.add(y + cellHeight)
    }
  }
  return freeze({
    width,
    height,
    columns,
    rows,
    marginX,
    marginY,
    gutterX,
    gutterY,
    cellWidth,
    cellHeight,
    xLines: freeze([...xLines].sort((a, b) => a - b)),
    yLines: freeze([...yLines].sort((a, b) => a - b)),
    cells: freeze(cells),
  })
}

export function snapValue(value, lines, threshold) {
  if (!Number.isFinite(value) || !Number.isFinite(threshold) || threshold < 0) return freeze({ value, snapped: false, guide: null })
  let guide = null
  let distance = Infinity
  for (const candidate of lines ?? []) {
    const next = Math.abs(candidate - value)
    if (next < distance) {
      distance = next
      guide = candidate
    }
  }
  if (guide !== null && distance <= threshold) return freeze({ value: guide, snapped: true, guide })
  return freeze({ value, snapped: false, guide: null })
}

export function gradientStopsForFeather({ opacity = 0.82, feather = 0.62, reverse = false } = {}) {
  const alpha = clamp01(opacity)
  const spread = clamp01(feather)
  const opaqueEnd = Math.max(0.02, Math.min(0.72, 0.5 - spread * 0.42))
  const softEnd = Math.max(opaqueEnd + 0.04, Math.min(0.98, 0.58 + spread * 0.38))
  const stops = [
    freeze({ offset: 0, opacity: alpha }),
    freeze({ offset: opaqueEnd, opacity: alpha }),
    freeze({ offset: softEnd, opacity: alpha * 0.22 }),
    freeze({ offset: 1, opacity: 0 }),
  ]
  return freeze(reverse
    ? stops.map((stop) => freeze({ offset: 1 - stop.offset, opacity: stop.opacity })).sort((a, b) => a.offset - b.offset)
    : stops)
}

export function moveIncludedSlide(slides, slideId, targetIndex) {
  const list = [...slides]
  const sourceIndex = list.findIndex((slide) => slide.id === slideId)
  if (sourceIndex < 0) throw new RangeError(`Unknown Slide: ${slideId}`)
  const bounded = Math.max(0, Math.min(list.length - 1, Number(targetIndex)))
  const [slide] = list.splice(sourceIndex, 1)
  list.splice(bounded, 0, slide)
  return freeze(list)
}

function issue(code, message, severity) {
  return freeze({ code, message, severity })
}

function readiness(issues) {
  if (issues.some((candidate) => candidate.severity === 'blocker')) return 'blocked'
  if (issues.length > 0) return 'review'
  return 'ready'
}

function slotLabel(slot, slide) {
  if (slot.startsWith('item:')) {
    const itemId = slot.split(':')[1]
    return slide.supportingItems?.find((item) => item.id === itemId)?.title || itemId
  }
  return slot.replace('primary:', 'Primary ')
}

function clamp01(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(1, number))
}
