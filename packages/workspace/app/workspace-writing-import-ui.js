let approvedWritingImportSource = null
let writingImportBusy = false

function textElement(name, value, className = '') {
  const node = document.createElement(name)
  node.textContent = value
  if (className) node.className = className
  return node
}

function issueList(title, issues, className) {
  const section = document.createElement('section')
  section.className = className
  section.append(textElement('h4', title))
  const list = document.createElement('ul')
  for (const item of issues) list.append(textElement('li', `Line ${item.line}: ${item.message}`))
  section.append(list)
  return section
}

function renderWritingImportPreview(result) {
  elements.writingImportPreview.replaceChildren()
  if (result.deck) {
    elements.writingImportPreview.append(
      textElement('h3', result.deck.title),
      textElement('p', `Canvas: ${result.deck.canvas}`),
      textElement(
        'p',
        `${result.counts.parts} Part${result.counts.parts === 1 ? '' : 's'} · ${result.counts.slides} Slide${result.counts.slides === 1 ? '' : 's'} · ${result.counts.present} present · ${result.counts.intentionallyBlank} intentionally blank · ${result.counts.unreviewed} unreviewed`,
      ),
    )
    const outline = document.createElement('ol')
    for (const part of result.deck.parts) {
      const partItem = textElement('li', part.title)
      const slides = document.createElement('ol')
      for (const slide of part.slides) slides.append(textElement('li', slide.title))
      partItem.append(slides)
      outline.append(partItem)
    }
    elements.writingImportPreview.append(textElement('h4', 'Ordered outline'), outline)
  } else {
    elements.writingImportPreview.append(textElement('h3', 'Preview blocked'))
  }
  if (result.warnings.length) {
    elements.writingImportPreview.append(issueList('Warnings · import may proceed', result.warnings, 'import-warnings'))
  }
  if (result.errors.length) {
    elements.writingImportPreview.append(issueList('Blocking errors', result.errors, 'import-errors'))
  } else {
    elements.writingImportPreview.append(textElement('p', 'Preview passed. Import will create a new local .pitchdeck.'))
  }
}

function invalidateWritingImportPreview(message = 'Text changed. Preview these exact bytes again.') {
  approvedWritingImportSource = null
  elements.importWriting.disabled = true
  elements.writingImportPreview.replaceChildren(textElement('p', message))
}

function setWritingImportBusy(value) {
  writingImportBusy = value
  elements.writingImportFile.disabled = value
  elements.writingImportSource.disabled = value
  elements.previewWritingImport.disabled = value
  elements.importWriting.disabled = value || approvedWritingImportSource === null
  elements.cancelWritingImport.disabled = value
}

async function loadWritingImportFile() {
  if (writingImportBusy) return false
  const file = elements.writingImportFile.files?.[0]
  if (!file) return false
  elements.writingImportSource.value = ''
  approvedWritingImportSource = null
  elements.importWriting.disabled = true
  if (!file.name.toLowerCase().endsWith('.md')) {
    invalidateWritingImportPreview('Choose a Workbench Markdown file ending in .md.')
    elements.writingImportFile.value = ''
    return false
  }
  if (file.size > WorkbenchWritingImport.limits.inputBytes) {
    invalidateWritingImportPreview(`File exceeds the ${WorkbenchWritingImport.limits.inputBytes}-byte writing-import limit.`)
    elements.writingImportFile.value = ''
    return false
  }
  setWritingImportBusy(true)
  elements.writingImportPreview.replaceChildren(textElement('p', `Reading ${file.name} locally…`))
  try {
    const bytes = await file.arrayBuffer()
    if (bytes.byteLength > WorkbenchWritingImport.limits.inputBytes) {
      throw Object.assign(new Error(`File exceeds the ${WorkbenchWritingImport.limits.inputBytes}-byte writing-import limit.`), { name: 'WritingImportTooLarge' })
    }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    elements.writingImportSource.value = source
    invalidateWritingImportPreview(`Loaded ${file.name} locally. Preview these exact bytes to continue.`)
    elements.writingImportSource.focus()
    return true
  } catch (error) {
    elements.writingImportSource.value = ''
    invalidateWritingImportPreview(`${error?.name ?? 'FileReadFailed'}: ${error?.message ?? 'The Markdown file could not be read as UTF-8.'}`)
    return false
  } finally {
    elements.writingImportFile.value = ''
    setWritingImportBusy(false)
  }
}

function previewWritingImport() {
  if (writingImportBusy) return null
  const source = elements.writingImportSource.value
  const result = WorkbenchWritingImport.parse(source)
  approvedWritingImportSource = result.ok ? source : null
  elements.importWriting.disabled = !result.ok
  renderWritingImportPreview(result)
  return result
}

async function importWriting() {
  if (writingImportBusy || approvedWritingImportSource === null) return
  const source = elements.writingImportSource.value
  const reparsed = WorkbenchWritingImport.parse(source)
  if (!reparsed.ok || source !== approvedWritingImportSource) {
    approvedWritingImportSource = null
    elements.importWriting.disabled = true
    renderWritingImportPreview(reparsed)
    return
  }
  const drafts = workspaceDraftSummary()
  if (drafts.total > 0) {
    elements.writingImportPreview.replaceChildren(
      textElement('h3', 'Import blocked'),
      textElement('p', 'Save or discard every pending workspace draft before importing writing.'),
    )
    return
  }
  setWritingImportBusy(true)
  try {
    const result = await window.deckBridge.create({ writingImport: reparsed.deck })
    const imported = result?.import
    const nextProjection = result?.projection
    if (!imported || !nextProjection?.slide?.id) throw Object.assign(new Error('Native import response is invalid'), { name: 'KernelUnavailable' })
    elements.writingImportDialog.close('imported')
    setPhase('plan')
    await refreshWorkspace(nextProjection.slide.id)
    setStatus(`Imported ${imported.filename} · ${imported.partCount} Part${imported.partCount === 1 ? '' : 's'} · ${imported.slideCount} Slide${imported.slideCount === 1 ? '' : 's'}`)
  } catch (error) {
    if (error?.name !== 'JobCancelled') {
      elements.writingImportPreview.replaceChildren(
        textElement('h3', `${error?.name ?? 'Import failed'}`),
        textElement('p', error?.message ?? 'Writing import failed'),
      )
    }
  } finally {
    setWritingImportBusy(false)
  }
}

async function copyConversionPrompt() {
  const originalLabel = 'Copy conversion prompt'
  elements.copyConversionPrompt.disabled = true
  try {
    const result = await window.deckBridge.copyText({ text: WORKBENCH_CONVERSION_PROMPT_V1.text })
    if (result?.copied !== true) throw Object.assign(new Error('Native clipboard did not confirm success'), { name: 'ClipboardWriteFailed' })
    elements.copyConversionPrompt.textContent = 'Copied'
    window.setTimeout(() => { elements.copyConversionPrompt.textContent = originalLabel }, 1600)
  } catch (error) {
    elements.copyConversionPrompt.textContent = originalLabel
    elements.conversionPromptHeading.textContent = 'Prompt was not copied'
    elements.conversionPromptStatus.textContent = `${error?.name ?? 'ClipboardWriteFailed'}: ${error?.message ?? 'Native clipboard write failed'}. Select and copy the prompt below.`
    elements.conversionPromptFallback.value = WORKBENCH_CONVERSION_PROMPT_V1.text
    if (!elements.conversionPromptDialog.open) elements.conversionPromptDialog.showModal()
    elements.conversionPromptFallback.focus()
    elements.conversionPromptFallback.select()
  } finally {
    elements.copyConversionPrompt.disabled = false
  }
}

function openWritingImportDialog() {
  if (writingImportBusy) return
  elements.writingImportFile.value = ''
  elements.writingImportSource.value = ''
  invalidateWritingImportPreview('Paste writing or choose a local .md file, then Preview. Import stays locked until these exact bytes pass.')
  if (!elements.writingImportDialog.open) elements.writingImportDialog.showModal()
  elements.writingImportSource.focus()
}

function bindWritingImportEvents() {
  elements.copyConversionPrompt.addEventListener('click', () => void copyConversionPrompt())
  elements.openWritingImport.addEventListener('click', openWritingImportDialog)
  elements.writingImportFile.addEventListener('change', () => void loadWritingImportFile())
  elements.writingImportSource.addEventListener('input', () => invalidateWritingImportPreview())
  elements.previewWritingImport.addEventListener('click', previewWritingImport)
  elements.importWriting.addEventListener('click', () => void importWriting())
  elements.writingImportDialog.addEventListener('cancel', (event) => {
    if (writingImportBusy) event.preventDefault()
  })
  elements.writingImportDialog.addEventListener('close', () => {
    if (writingImportBusy) return
    elements.writingImportFile.value = ''
    elements.writingImportSource.value = ''
    approvedWritingImportSource = null
  })
}
