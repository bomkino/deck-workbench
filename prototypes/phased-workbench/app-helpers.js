function summaryChip(value, label) {
  return `<span class="summary-chip"><strong>${value}</strong><span>${escapeHTML(label)}</span></span>`
}

function readinessLabel(readiness) {
  return readiness === 'ready' ? 'Ready' : readiness === 'review' ? 'Review' : 'Blocked'
}

function contentPatternLabel(pattern) {
  return {
    'simple-copy': 'Simple Copy',
    quote: 'Quote',
    repeater: 'Repeater',
    comparison: 'Comparison',
    'gallery-captions': 'Gallery Captions',
    'no-on-slide-text': 'No On-Slide Text',
    custom: 'Custom',
  }[pattern] ?? titleCase(pattern)
}

function copyMetadata(slide) {
  if (slide.textPresence === 'no-on-slide-text') return 'No text'
  const fields = Object.values(slide.copy ?? {})
  const paragraphs = copyFieldText(slide.copy?.body).split(/\n\s*\n/).filter(Boolean).length
  const links = [copyFieldText(slide.copy?.headline), copyFieldText(slide.copy?.subheadline), copyFieldText(slide.copy?.body)].join('\n').match(/\[[^\]]+\]\([^)]+\)/g)?.length ?? 0
  const present = fields.filter((field) => field.state === 'present').length
  return `${present}/3 fields · ${paragraphs} ¶ · ${links} link${links === 1 ? '' : 's'}`
}

function renderFieldAbsence(field, label) {
  if (field?.state === 'intentionally-blank') return `<span class="blank-copy-state">No ${escapeHTML(label)} — intentional</span>`
  return `<span class="blank-copy-state">${escapeHTML(label)} unreviewed</span>`
}

function trayCard(asset, { action = 'preview', label = '', slotKey = '' } = {}) {
  return `<button class="tray-card" data-asset-id="${escapeAttribute(asset.id)}" data-tray-action="${escapeAttribute(action)}" data-slot-key="${escapeAttribute(slotKey)}" type="button" title="${escapeAttribute(asset.filename)}">
    <span class="tray-card-image" style="background-image:${assetBackground(asset)}"></span>
    <span class="tray-card-copy"><strong>${escapeHTML(label)}</strong><br>${escapeHTML(asset.filename)}</span>
  </button>`
}

function slotLabelForSlide(slotKey, slide) {
  if (!slotKey) return 'Unassigned'
  if (slotKey.startsWith('item:')) {
    const itemId = slotKey.split(':')[1]
    return slide?.supportingItems?.find((item) => item.id === itemId)?.title ?? itemId
  }
  return slotKey.replace('primary:', 'Primary ')
}

function sourceTreatmentLabel(value) {
  return {
    ready: 'Ready as supplied',
    'crop-provisional': 'Crop provisional',
    'needs-expansion': 'Source needs expansion',
    'needs-retouch': 'Source needs retouching',
    'needs-higher-resolution': 'Needs higher resolution',
    placeholder: 'Placeholder source',
    'find-more': 'Find a stronger image',
  }[value] ?? titleCase(value)
}

function mediaActionLabel(action) {
  return {
    shortlist: 'shortlisted',
    select: 'selected',
    alternate: 'added as alternate',
    reject: 'rejected for Slide',
    clear: 'decision cleared',
    'demote-to-shortlist': 'demoted to shortlist',
    'demote-to-alternate': 'demoted to alternate',
  }[action] ?? action
}

function pageNumberForSlide(slideId) {
  let page = 0
  for (const slide of state.slides) {
    if (slide.lifecycle === 'included') page += 1
    if (slide.id === slideId) return page
  }
  return 0
}

function gradientCssForPreview(gradient) {
  if (!gradient?.enabled) return 'transparent'
  const start = gradient.start ?? { x: 0, y: 0.5 }
  const end = gradient.end ?? { x: 0.7, y: 0.5 }
  const opacity = gradient.opacity ?? 0.8
  const spread = Math.round(55 + (gradient.feather ?? 0.5) * 35)
  if (gradient.type === 'radial') {
    return gradient.reverse
      ? `radial-gradient(circle at ${start.x * 100}% ${start.y * 100}%, transparent 10%, rgb(0 0 0 / ${opacity}) ${spread}%)`
      : `radial-gradient(circle at ${start.x * 100}% ${start.y * 100}%, rgb(0 0 0 / ${opacity}), transparent ${spread}%)`
  }
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI + 90
  return `linear-gradient(${angle}deg, rgb(0 0 0 / ${opacity}), transparent ${spread}%)`
}

function renderMarkdown(markdown) {
  if (!markdown) return ''
  const safe = String(markdown).replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  return safe.split(/\n\s*\n/).map((paragraph) => `<p>${renderInlineMarkdown(paragraph).replaceAll('\n', '<br>')}</p>`).join('')
}

function renderInlineMarkdown(markdown) {
  let safe = escapeHTML(markdown ?? '')
  safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)(?:\s+&quot;[^&]*&quot;)?\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  safe = safe.replace(/_([^_]+)_/g, '<em>$1</em>')
  safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  return safe
}

function markdownToPlain(markdown) {
  return String(markdown ?? '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeVisualStyle(value) {
  const normalized = slug(value)
  if (VISUAL_STYLE_DEFINITIONS[normalized]) return normalized
  if (normalized === 'full-bleed-with-overlay') return 'full-bleed-overlay'
  return 'undecided'
}

function normalizeContentPattern(value) {
  const normalized = slug(value)
  return CONTENT_PATTERNS.includes(normalized) ? normalized : 'simple-copy'
}

function sampleWorkbenchMarkdown() {
  return `# Deck
Title: Sample Import
Version: v01
Canvas: 2576x1080

## Part: Opening

### Slide
Internal title: The opening promise
Purpose: Establish the emotional promise immediately.
Style: full-bleed-overlay
Text presence: visible
Content pattern: simple-copy

#### Headline
Everything changes at Christmas.

#### Subheadline
One family. One secret. No quiet exits.

#### Body
First paragraph with [a preserved link](https://example.com).

Second paragraph remains separate.

### Slide
Internal title: Visual pause
Purpose: Give the reader one beat of pure atmosphere.
Style: full-bleed
Text presence: no-on-slide-text
Content pattern: no-on-slide-text

#### Headline

#### Subheadline

#### Body
`
}

function deduplicateIssues(issues) {
  const seen = new Set()
  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function slug(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item'
}

function titleCase(value) {
  return String(value ?? '').replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeAttribute(value) {
  return escapeHTML(value).replaceAll('\n', '&#10;')
}
