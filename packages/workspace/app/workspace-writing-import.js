(() => {
  'use strict'

  const FORMAT = 'workbench-markdown/1'
  const DEFAULT_CANVAS = 'cinemascope-2576x1080'
  const CANVAS_IDS = Object.freeze([
    DEFAULT_CANVAS,
    'widescreen-1920x1080',
    'square-2160x2160',
    'standard-1920x1440',
    'a4-portrait',
    'letter-portrait',
  ])
  const STYLE_IDS = Object.freeze([
    'undecided',
    'text-only',
    'full-bleed',
    'full-bleed-overlay',
    'image-text',
    'diptych',
    'triptych',
    'gallery',
    'custom',
  ])
  const CONTENT_PATTERN_IDS = Object.freeze([
    'simple-copy',
    'quote',
    'repeater',
    'comparison',
    'gallery-captions',
    'no-on-slide-text',
    'custom',
  ])
  const COPY_STATES = Object.freeze(['present', 'intentionally-blank', 'unreviewed'])
  const COPY_ROLES = Object.freeze(['headline', 'subheadline', 'body'])
  const ROLE_HEADINGS = Object.freeze({
    '#### Headline': 'headline',
    '#### Subheadline': 'subheadline',
    '#### Body': 'body',
  })
  const RESERVED_COPY_PREFIXES = Object.freeze([
    '# Deck',
    'Format:',
    'Title:',
    'Canvas:',
    '## Part:',
    '### Slide:',
    '#### Headline',
    '#### Subheadline',
    '#### Body',
    'Purpose:',
    'Style:',
    'Content pattern:',
    'State:',
  ])
  const LIMITS = Object.freeze({
    inputBytes: 524288,
    deckTitleCharacters: 240,
    partTitleCharacters: 240,
    slideTitleCharacters: 240,
    purposeCharacters: 4096,
    copyFieldCharacters: 262144,
    partCount: 200,
    slideCount: 1000,
  })

  function utf8ByteLength(value) {
    return new TextEncoder().encode(value).byteLength
  }

  function issue(line, message) {
    return Object.freeze({ line: Math.max(1, Number(line) || 1), message })
  }

  function beginsReservedCopyMarker(line) {
    return RESERVED_COPY_PREFIXES.some((prefix) => line.startsWith(prefix))
  }

  function hasStructuralEscape(line) {
    if (!line.startsWith('\\')) return false
    const leadingBackslashes = line.match(/^\\+/)?.[0].length ?? 0
    return beginsReservedCopyMarker(line.slice(leadingBackslashes))
  }

  function decodeCopyLine(line) {
    return hasStructuralEscape(line) ? line.slice(1) : line
  }

  function fieldValue(line, label) {
    return line.startsWith(`${label}:`) ? line.slice(label.length + 1).trim() : null
  }

  function isStructuralLine(line) {
    return line === '# Deck'
      || line.startsWith('# ')
      || line.startsWith('## ')
      || line.startsWith('### ')
      || line.startsWith('#### ')
      || line.startsWith('Format:')
      || line.startsWith('Title:')
      || line.startsWith('Canvas:')
      || line.startsWith('Purpose:')
      || line.startsWith('Style:')
      || line.startsWith('Content pattern:')
      || line.startsWith('State:')
      || line.startsWith('Version:')
  }

  function parseWorkbenchMarkdown(source) {
    const original = String(source ?? '')
    const normalizedSource = original.replace(/\r\n/g, '\n')
    const errors = []
    const warnings = []
    const byteLength = utf8ByteLength(normalizedSource)
    if (byteLength > LIMITS.inputBytes) {
      errors.push(issue(1, `Input exceeds Workbench writing-import byte limit of ${LIMITS.inputBytes}`))
    }

    const lines = normalizedSource.split('\n')
    const deck = { format: '', title: '', canvas: DEFAULT_CANVAS, parts: [] }
    const topFields = new Map()
    let sawDeckHeading = false
    let currentPart = null
    let currentSlide = null
    let currentCopy = null
    let totalSlides = 0

    function addError(lineNumber, message) {
      errors.push(issue(lineNumber, message))
    }

    function finishCopy(nextLineNumber) {
      if (!currentCopy) return
      if (currentCopy.stateLine === null) {
        addError(currentCopy.headingLine, `${currentCopy.label} is missing State`)
      }
      const rawLines = [...currentCopy.lines]
      if (rawLines[0] === '') rawLines.shift()
      if (rawLines.at(-1) === '') rawLines.pop()
      const value = rawLines.map(decodeCopyLine).join('\n')
      if (value.length > LIMITS.copyFieldCharacters) {
        addError(currentCopy.headingLine, `${currentCopy.label} exceeds copy-field limit of ${LIMITS.copyFieldCharacters} characters`)
      }
      if (currentCopy.state === 'present' && !/\S/u.test(value)) {
        addError(currentCopy.stateLine || currentCopy.headingLine, `${currentCopy.label} is present but has no copy`)
      }
      if (currentCopy.state !== 'present' && /\S/u.test(value)) {
        addError(currentCopy.contentLine || currentCopy.stateLine || nextLineNumber, `Content is not allowed after ${currentCopy.state}`)
      }
      currentCopy.target.state = currentCopy.state || 'unreviewed'
      currentCopy.target.value = currentCopy.state === 'present' ? value : ''
      currentCopy = null
    }

    function finishSlide(nextLineNumber) {
      finishCopy(nextLineNumber)
      if (!currentSlide) return
      for (const key of ['purpose', 'style', 'contentPattern']) {
        if (!currentSlide._seen.has(key)) addError(currentSlide.line, `Slide is missing ${key === 'contentPattern' ? 'Content pattern' : key[0].toUpperCase() + key.slice(1)}`)
      }
      for (const role of COPY_ROLES) {
        if (!currentSlide._copySeen.has(role)) addError(currentSlide.line, `Slide is missing ${role[0].toUpperCase() + role.slice(1)}`)
      }
      delete currentSlide._seen
      delete currentSlide._copySeen
      currentSlide = null
    }

    function finishPart(nextLineNumber) {
      finishSlide(nextLineNumber)
      if (!currentPart) return
      if (!currentPart._seen.has('purpose')) addError(currentPart.line, 'Part is missing Purpose')
      delete currentPart._seen
      currentPart = null
    }

    function duplicateOrSet(target, seen, key, label, value, lineNumber) {
      if (seen.has(key)) {
        addError(lineNumber, `Duplicate ${label}`)
        return
      }
      seen.add(key)
      target[key] = value
    }

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const lineNumber = index + 1

      const copyStateLine = currentCopy ? fieldValue(line, 'State') : null
      if (currentCopy && !isStructuralLine(line)) {
        currentCopy.lines.push(line)
        if (line !== '' && currentCopy.contentLine === null) currentCopy.contentLine = lineNumber
        continue
      }
      if (currentCopy && hasStructuralEscape(line)) {
        currentCopy.lines.push(line)
        if (currentCopy.contentLine === null) currentCopy.contentLine = lineNumber
        continue
      }
      if (currentCopy && copyStateLine === null) finishCopy(lineNumber)

      if (line === '') continue

      if (line === '# Deck') {
        if (sawDeckHeading) addError(lineNumber, 'Duplicate Deck heading')
        if (currentPart || currentSlide) addError(lineNumber, 'Deck heading must appear before every Part')
        sawDeckHeading = true
        continue
      }

      if (line.startsWith('## Part:')) {
        if (!sawDeckHeading) addError(lineNumber, 'Part appears before Deck heading')
        finishPart(lineNumber)
        const title = line.slice('## Part:'.length).trim()
        if (!title) addError(lineNumber, 'Part title is missing')
        if (title.length > LIMITS.partTitleCharacters) addError(lineNumber, `Part title exceeds ${LIMITS.partTitleCharacters} characters`)
        currentPart = { title, purpose: '', slides: [], line: lineNumber, _seen: new Set() }
        deck.parts.push(currentPart)
        if (deck.parts.length > LIMITS.partCount) addError(lineNumber, `Part count exceeds Workbench limit of ${LIMITS.partCount}`)
        continue
      }

      if (line.startsWith('### Slide:')) {
        if (!currentPart) {
          addError(lineNumber, 'Slide appears before Part')
          continue
        }
        finishSlide(lineNumber)
        const title = line.slice('### Slide:'.length).trim()
        if (!title) addError(lineNumber, 'Slide title is missing')
        if (title.length > LIMITS.slideTitleCharacters) addError(lineNumber, `Slide title exceeds ${LIMITS.slideTitleCharacters} characters`)
        currentSlide = {
          title,
          purpose: '',
          style: '',
          contentPattern: '',
          copies: {
            headline: { state: 'unreviewed', value: '' },
            subheadline: { state: 'unreviewed', value: '' },
            body: { state: 'unreviewed', value: '' },
          },
          line: lineNumber,
          _seen: new Set(),
          _copySeen: new Set(),
        }
        currentPart.slides.push(currentSlide)
        totalSlides += 1
        if (totalSlides > LIMITS.slideCount) addError(lineNumber, `Slide count exceeds Workbench limit of ${LIMITS.slideCount}`)
        continue
      }

      if (Object.hasOwn(ROLE_HEADINGS, line)) {
        if (!currentSlide) {
          addError(lineNumber, `${line.slice(5)} field appears outside a Slide`)
          continue
        }
        const role = ROLE_HEADINGS[line]
        if (currentSlide._copySeen.has(role)) {
          addError(lineNumber, `Duplicate ${role[0].toUpperCase() + role.slice(1)} field`)
          continue
        }
        const expectedRole = COPY_ROLES[currentSlide._copySeen.size]
        if (role !== expectedRole) addError(lineNumber, `Copy fields must be ordered Headline, Subheadline, Body`)
        currentSlide._copySeen.add(role)
        currentCopy = {
          label: role[0].toUpperCase() + role.slice(1),
          headingLine: lineNumber,
          stateLine: null,
          state: '',
          lines: [],
          contentLine: null,
          target: currentSlide.copies[role],
        }
        continue
      }

      const format = fieldValue(line, 'Format')
      if (format !== null) {
        if (currentPart || currentSlide) addError(lineNumber, 'Format is only allowed at Deck level')
        if (topFields.has('format')) addError(lineNumber, 'Duplicate Format field')
        else {
          topFields.set('format', lineNumber)
          deck.format = format
          if (format !== FORMAT) addError(lineNumber, `Format must be ${FORMAT}`)
        }
        continue
      }

      const title = fieldValue(line, 'Title')
      if (title !== null) {
        if (currentPart || currentSlide) addError(lineNumber, 'Title is only allowed at Deck level')
        if (topFields.has('title')) addError(lineNumber, 'Duplicate Title field')
        else {
          topFields.set('title', lineNumber)
          deck.title = title
          if (!title) addError(lineNumber, 'Deck title is missing')
          if (title.length > LIMITS.deckTitleCharacters) addError(lineNumber, `Deck title exceeds ${LIMITS.deckTitleCharacters} characters`)
        }
        continue
      }

      const canvas = fieldValue(line, 'Canvas')
      if (canvas !== null) {
        if (currentPart || currentSlide) addError(lineNumber, 'Canvas is only allowed at Deck level')
        if (topFields.has('canvas')) addError(lineNumber, 'Duplicate Canvas field')
        else {
          topFields.set('canvas', lineNumber)
          deck.canvas = canvas
          if (!CANVAS_IDS.includes(canvas)) addError(lineNumber, `Unsupported Canvas: ${canvas || '(empty)'}`)
        }
        continue
      }

      const purpose = fieldValue(line, 'Purpose')
      if (purpose !== null) {
        const target = currentSlide ?? currentPart
        if (!target) addError(lineNumber, 'Purpose appears outside a Part or Slide')
        else {
          duplicateOrSet(target, target._seen, 'purpose', 'Purpose field', purpose, lineNumber)
          if (!purpose) addError(lineNumber, 'Purpose is missing')
          if (purpose.length > LIMITS.purposeCharacters) addError(lineNumber, `Purpose exceeds ${LIMITS.purposeCharacters} characters`)
        }
        continue
      }

      const style = fieldValue(line, 'Style')
      if (style !== null) {
        if (!currentSlide) addError(lineNumber, 'Style appears outside a Slide')
        else {
          duplicateOrSet(currentSlide, currentSlide._seen, 'style', 'Style field', style, lineNumber)
          if (!STYLE_IDS.includes(style)) addError(lineNumber, `Unknown Style: ${style || '(empty)'}`)
        }
        continue
      }

      const contentPattern = fieldValue(line, 'Content pattern')
      if (contentPattern !== null) {
        if (!currentSlide) addError(lineNumber, 'Content pattern appears outside a Slide')
        else {
          duplicateOrSet(currentSlide, currentSlide._seen, 'contentPattern', 'Content pattern field', contentPattern, lineNumber)
          if (!CONTENT_PATTERN_IDS.includes(contentPattern)) addError(lineNumber, `Unknown Content pattern: ${contentPattern || '(empty)'}`)
        }
        continue
      }

      const state = fieldValue(line, 'State')
      if (state !== null) {
        if (!currentCopy) addError(lineNumber, 'State appears outside a copy field')
        else if (currentCopy.stateLine !== null) addError(lineNumber, `Duplicate State field for ${currentCopy.label}`)
        else {
          if (currentCopy.lines.some((candidate) => candidate !== '')) {
            addError(lineNumber, `State must appear before ${currentCopy.label} copy`)
          }
          currentCopy.stateLine = lineNumber
          currentCopy.state = state
          if (!COPY_STATES.includes(state)) addError(lineNumber, `Unknown copy State: ${state || '(empty)'}`)
        }
        continue
      }

      if (line.startsWith('Version:')) {
        addError(lineNumber, 'Unknown top-level field Version; Workbench Markdown v1 requires Format only')
        continue
      }

      if (line.startsWith('#')) {
        addError(lineNumber, 'Malformed hierarchy or unknown heading')
        continue
      }

      if (/^[A-Za-z][A-Za-z ]*:/.test(line) && !currentPart && !currentSlide) {
        addError(lineNumber, `Unknown top-level field: ${line.slice(0, line.indexOf(':'))}`)
        continue
      }

      addError(lineNumber, 'Copy appears outside a recognized field')
    }

    finishPart(lines.length)

    if (!sawDeckHeading) errors.push(issue(1, 'Missing # Deck heading'))
    if (!topFields.has('format')) errors.push(issue(1, `Missing required Format: ${FORMAT}`))
    if (!topFields.has('title') || !deck.title) errors.push(issue(topFields.get('title') ?? 1, 'Missing Deck title'))
    if (!topFields.has('canvas')) {
      deck.canvas = DEFAULT_CANVAS
      warnings.push(issue(topFields.get('title') ?? 1, `Canvas missing; defaulted to ${DEFAULT_CANVAS}`))
    }
    if (deck.parts.length === 0) errors.push(issue(1, 'Missing Part'))
    if (deck.parts.some((part) => part.slides.length === 0)) {
      for (const part of deck.parts.filter((candidate) => candidate.slides.length === 0)) {
        errors.push(issue(part.line, `Part ${part.title || '(untitled)'} is missing a Slide`))
      }
    }
    if (totalSlides === 0) errors.push(issue(1, 'Deck must contain at least one Slide'))

    for (const part of deck.parts) {
      delete part.line
      for (const slide of part.slides) delete slide.line
    }

    const counts = { present: 0, intentionallyBlank: 0, unreviewed: 0 }
    for (const part of deck.parts) {
      for (const slide of part.slides) {
        for (const copy of Object.values(slide.copies)) {
          if (copy.state === 'present') counts.present += 1
          else if (copy.state === 'intentionally-blank') counts.intentionallyBlank += 1
          else if (copy.state === 'unreviewed') counts.unreviewed += 1
        }
      }
    }

    return Object.freeze({
      ok: errors.length === 0,
      normalizedSource,
      byteLength,
      deck: errors.length === 0 ? Object.freeze(deck) : null,
      warnings: Object.freeze(warnings),
      errors: Object.freeze(errors),
      counts: Object.freeze({ parts: deck.parts.length, slides: totalSlides, ...counts }),
    })
  }

  globalThis.WorkbenchWritingImport = Object.freeze({
    format: FORMAT,
    defaultCanvas: DEFAULT_CANVAS,
    canvasIds: CANVAS_IDS,
    styleIds: STYLE_IDS,
    contentPatternIds: CONTENT_PATTERN_IDS,
    copyStates: COPY_STATES,
    limits: LIMITS,
    parse: parseWorkbenchMarkdown,
  })
})()
