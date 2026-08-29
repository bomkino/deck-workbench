function parseWorkbenchMarkdown(source) {
  const lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const title = lines.find((line) => /^Title:\s*/i.test(line))?.replace(/^Title:\s*/i, '').trim() ?? ''
  const version = lines.find((line) => /^Version:\s*/i.test(line))?.replace(/^Version:\s*/i, '').trim() ?? ''
  const parts = []
  const slides = []
  let currentPart = null
  let currentSlide = null
  let currentCopyRole = null
  let buffer = []

  const flushCopy = () => {
    if (!currentSlide || !currentCopyRole) return
    const markdown = buffer.join('\n').replace(/^\n+|\n+$/g, '')
    currentSlide.copy[currentCopyRole] = markdown.length > 0 ? copyField('present', markdown) : copyField('intentionally-blank')
    currentCopyRole = null
    buffer = []
  }

  const finishSlide = () => {
    flushCopy()
    if (!currentSlide) return
    for (const role of ['headline', 'subheadline', 'body']) currentSlide.copy[role] ??= copyField('unreviewed')
    const nextAssembly = createAssembly()
    currentSlide.assemblies = [nextAssembly]
    currentSlide.activeAssemblyId = nextAssembly.id
    currentSlide.lifecycle = 'included'
    currentSlide.copyReviewState = 'clean'
    currentSlide.layoutReviewState = 'clean'
    currentSlide.findMoreMedia = { state: 'not-needed', brief: '', existingPrimaryStatus: 'none' }
    currentSlide.supportingItems = []
    slides.push(currentSlide)
    currentSlide = null
  }

  for (const line of lines) {
    const partMatch = line.match(/^##\s+Part:\s*(.+)$/i)
    if (partMatch) {
      finishSlide()
      currentPart = { id: `part-${slug(partMatch[1])}-${crypto.randomUUID().slice(0, 6)}`, title: partMatch[1].trim() }
      parts.push(currentPart)
      continue
    }
    if (/^###\s+Slide\b/i.test(line)) {
      finishSlide()
      if (!currentPart) {
        currentPart = { id: `part-imported-${crypto.randomUUID().slice(0, 6)}`, title: 'Imported' }
        parts.push(currentPart)
      }
      currentSlide = {
        id: `slide-${crypto.randomUUID()}`,
        partId: currentPart.id,
        internalTitle: '',
        purpose: '',
        textPresence: 'visible',
        contentPattern: 'simple-copy',
        visualStyle: 'undecided',
        mediaSlotCount: 0,
        textHint: 'left',
        copy: {},
      }
      continue
    }
    if (!currentSlide) continue
    if (/^Internal title:\s*/i.test(line)) currentSlide.internalTitle = line.replace(/^Internal title:\s*/i, '').trim()
    else if (/^Purpose:\s*/i.test(line)) currentSlide.purpose = line.replace(/^Purpose:\s*/i, '').trim()
    else if (/^Style:\s*/i.test(line)) currentSlide.visualStyle = normalizeVisualStyle(line.replace(/^Style:\s*/i, '').trim())
    else if (/^Text presence:\s*/i.test(line)) currentSlide.textPresence = line.replace(/^Text presence:\s*/i, '').trim() || 'visible'
    else if (/^Content pattern:\s*/i.test(line)) currentSlide.contentPattern = normalizeContentPattern(line.replace(/^Content pattern:\s*/i, '').trim())
    else {
      const copyHeading = line.match(/^####\s+(Headline|Subheadline|Body)\s*$/i)
      if (copyHeading) {
        flushCopy()
        currentCopyRole = copyHeading[1].toLowerCase()
      } else if (currentCopyRole) buffer.push(line)
    }
  }
  finishSlide()
  if (slides.length === 0) throw new Error('No “### Slide” sections were found.')
  return { title, version, parts, slides }
}

function renderImportPreview(result) {
  const missingPurpose = result.slides.filter((slide) => !slide.purpose).length
  const undecided = result.slides.filter((slide) => slide.visualStyle === 'undecided').length
  return `<strong>${result.slides.length} Slides across ${result.parts.length} Parts</strong>
    <p>${missingPurpose} missing Purpose · ${undecided} Visual Style undecided</p>
    <ol>${result.slides.slice(0, 8).map((slide) => `<li>${escapeHTML(slide.internalTitle || 'Untitled Slide')}</li>`).join('')}</ol>
    ${result.slides.length > 8 ? `<p>…and ${result.slides.length - 8} more.</p>` : ''}`
}

/* Curate */
