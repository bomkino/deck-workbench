import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [html, styles, core, curate, visual] = await Promise.all([
  readFile(new URL('../packages/workspace/app/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-core.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-curate.js', import.meta.url), 'utf8'),
  readFile(new URL('../packages/workspace/app/workspace-visual.js', import.meta.url), 'utf8'),
])
const workspace = `${core}\n${curate}\n${visual}`

function ruleFor(selector) {
  const start = styles.indexOf(`${selector} {`)
  assert.notEqual(start, -1, `missing CSS rule: ${selector}`)
  const end = styles.indexOf('}', start)
  assert.notEqual(end, -1, `unterminated CSS rule: ${selector}`)
  return styles.slice(start, end + 1)
}

test('Assemble follows the saved Plan and exposes the Slide rail and direct controls', () => {
  assert.doesNotMatch(html, /id="pattern-choice"|Starter Pattern|Apply new Assembly/)
  assert.match(html, /id="assembly-slide-rail"/)
  assert.match(html, /id="assembly-layout-source"/)
  assert.match(html, /id="edit-assembly-plan"/)
  assert.match(html, /id="assembly-back"/)
  assert.match(html, /id="assembly-next"/)
  assert.match(html, /role="group" aria-label="Align selected Element"/)
  assert.match(html, /id="visual-element"/)
  assert.match(html, /<fieldset class="crop-controls" disabled>/)
  assert.match(html, /id="composition-layer" aria-label="Active Assembly Composition"/)
  assert.match(html, /data-image-fit="fill"[\s\S]*data-image-fit="fit"/)
  assert.match(html, /data-text-size="small"[\s\S]*data-text-size="medium"[\s\S]*data-text-size="large"/)
  assert.match(html, /id="gradient-strength"[\s\S]*id="gradient-start-color"[\s\S]*id="gradient-end-color"/)
  assert.match(html, /id="image-swap-candidates"/)
})

test('shared workspace dispatches named kernel commands and keeps Assets semantic', () => {
  for (const commandType of ['designOption.createFromPlan', 'element.frame.update', 'element.crop.update', 'element.gradient.update', 'element.textSize.update', 'element.imageFit.update']) {
    assert.match(visual, new RegExp(`['"]${commandType.replaceAll('.', '\\.')}['"]`))
  }
  for (const commandType of ['curate.projectJudgment.set', 'curate.slideDecision.set', 'curate.findMore.set']) {
    assert.match(curate, new RegExp(`executeCurateCommand\\('${commandType.replaceAll('.', '\\.')}'`))
  }
  assert.match(curate, /name: 'media\.assets'/)
  assert.match(curate, /name: 'media\.roots'/)
  assert.match(visual, /name: 'media\.assets'/)
  assert.match(visual, /params: \{ assetIds \}/)
  assert.match(visual, /next\.contentBlocks\.find\(\(block\) => block\.id === element\.contentBlockId\)/)
  assert.match(visual, /next\.mediaAssignments\?\.find\(\(candidate\) => candidate\.role === element\.mediaRole\)/)
  assert.match(html, /id="writing-import-file" type="file" accept="\.md,text\/markdown,text\/plain"/)
  assert.doesNotMatch(workspace, /createObjectURL|readAsDataURL|webkit\.messageHandlers/)
})

test('Assembly image placement preserves the source aspect ratio for Fit, Fill, crop, and frame resize', () => {
  assert.match(styles, /\.composition-image\.has-rendition \{ background:\s*transparent;/)
  const start = visual.indexOf('function proportionalImagePlacement')
  const end = visual.indexOf('function applyProportionalImagePlacement', start)
  assert.ok(start >= 0 && end > start)
  const source = visual.slice(start, end)
  const placement = Function(
    'clamp',
    `"use strict"; ${source}; return proportionalImagePlacement;`,
  )((value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)))

  const sourceAspect = 4032 / 3024
  for (const frame of [{ width: 2576, height: 1080 }, { width: 640, height: 1280 }, { width: 900, height: 900 }]) {
    for (const imageFit of ['fit', 'fill']) {
      const result = placement({
        sourceWidth: 4032,
        sourceHeight: 3024,
        frameWidth: frame.width,
        frameHeight: frame.height,
        crop: { x: 0.14, y: 0.08, width: 0.7, height: 0.82 },
        imageFit,
      })
      const renderedWidth = parseFloat(result.width) * frame.width / 100
      const renderedHeight = parseFloat(result.height) * frame.height / 100
      assert.ok(Math.abs(renderedWidth / renderedHeight - sourceAspect) < 1e-10)
      if (imageFit === 'fit') {
        assert.ok(renderedWidth <= frame.width + 1e-8)
        assert.ok(renderedHeight <= frame.height + 1e-8)
      } else {
        assert.ok(renderedWidth >= frame.width - 1e-8)
        assert.ok(renderedHeight >= frame.height - 1e-8)
      }
    }
  }
  const dimensionsStart = visual.indexOf('function assemblyImageSourceDimensions')
  const dimensionsEnd = visual.indexOf('function applyProportionalImagePlacement', dimensionsStart)
  const dimensions = Function(
    `"use strict"; ${visual.slice(dimensionsStart, dimensionsEnd)}; return assemblyImageSourceDimensions;`,
  )()
  assert.deepEqual(
    dimensions({ dataset: { sourceWidth: '4032', sourceHeight: '3024' } }, { naturalWidth: 384, naturalHeight: 512 }),
    { width: 384, height: 512 },
    'decoded EXIF-oriented rendition dimensions must override raw catalogue dimensions',
  )
  assert.match(visual, /applyElementNodeFrame[\s\S]*applyProportionalImagePlacement\(node, frame\)/)
  assert.match(visual, /assemblyCandidateLoadKey[\s\S]*curateMediaLoadGeneration/)
  assert.match(visual, /assetIds\.slice\(index, index \+ 250\)/)
})

test('Full Bleed Fill supports direct proportional image panning instead of a clamped no-op frame move', () => {
  const start = visual.indexOf('function visibleImageCrop')
  const end = visual.indexOf('function isFullCanvasFrame', start)
  const visibleCrop = Function(
    'clamp',
    `"use strict"; ${visual.slice(start, end)}; return visibleImageCrop;`,
  )((value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value)))
  const crop = visibleCrop({
    sourceWidth: 4000,
    sourceHeight: 3000,
    frameWidth: 2576,
    frameHeight: 1080,
    crop: { x: 0, y: 0, width: 1, height: 1 },
  })
  assert.equal(crop.width, 1)
  assert.ok(crop.height < 1)
  const panStart = visual.indexOf('function beginImagePanInteraction')
  const panEnd = visual.indexOf('function beginElementPointerInteraction', panStart)
  const pan = visual.slice(panStart, panEnd)
  assert.match(html, /data-image-fit="fill"/)
  assert.match(visual, /dataset\.panImageElementId/)
  assert.match(pan, /'element\.crop\.update'/)
  assert.match(pan, /x: clamp\(origin\.x -/)
  assert.match(pan, /y: clamp\(origin\.y -/)
  assert.match(pan, /preserveCurrentSelection: true/)
  assert.match(visual, /const canCrop = selected\?\.kind === 'image' && \(selected\.imageFit \?\? 'fill'\) === 'fill'/)
  assert.match(visual, /Switch to Fill to crop or pan/)
})

test('image pan handle stays interactive above later text without changing paint order', () => {
  assert.match(visual, /imageInteractions\.push\(\{ element, node \}\)/)
  assert.match(visual, /for \(const \{ element, node \} of imageInteractions\)[\s\S]*appendImagePanInteractionLayer/)
  assert.match(visual, /dataset\.imagePanInteractionFor = element\.id/)
  assert.match(styles, /\.image-pan-interaction-layer \{[^}]*pointer-events:\s*none;/)
  assert.match(styles, /\.image-pan-interaction-layer\.is-selected\[data-image-fit="fill"\] > \.image-pan-handle \{[^}]*pointer-events:\s*auto;/)
})

test('gradient handles stay interactive above text without changing paint order', () => {
  assert.match(visual, /gradientInteractions\.push\(\{ element, node \}\)/)
  assert.match(visual, /for \(const \{ element, node \} of gradientInteractions\)[\s\S]*appendGradientInteractionLayer/)
  assert.match(styles, /\.gradient-interaction-layer \{[^}]*pointer-events:\s*none;/)
  assert.match(styles, /\.gradient-interaction-layer\.is-selected \.gradient-handle[^}]*pointer-events:\s*auto;/)
})

test('Assembly swaps the selected media role atomically through the existing Curate slot command', () => {
  const start = visual.indexOf('async function swapSelectedAssemblyImage')
  const end = visual.indexOf('function syncVisualControls', start)
  const swap = visual.slice(start, end)
  assert.match(swap, /candidate\.key !== slot\.key/)
  assert.match(swap, /state: 'selected', slotKey: slot\.key/)
  assert.match(swap, /'curate\.slideDecision\.set'/)
  assert.match(swap, /preserveCurrentSelection: true/)
  assert.match(swap, /assemblyInteractionPending/)
})

test('Assembly uses full preview renditions and labels multi-image slots exactly', () => {
  assert.match(visual, /asset\?\.renditions\?\.previewStandard \?\? asset\?\.renditions\?\.gridStandard/)
  const label = Function(
    `"use strict"; ${visual.slice(visual.indexOf('function compositionElementLabel'), visual.indexOf('function proportionalImagePlacement'))}; return compositionElementLabel;`,
  )()
  assert.equal(label({ kind: 'image', mediaRole: 'primary' }), 'Image · Primary 1')
  assert.equal(label({ kind: 'image', mediaRole: 'primary:2' }), 'Image · Primary 2')
  assert.equal(label({ kind: 'image', mediaRole: 'primary:3' }), 'Image · Primary 3')
})

test('Composition geometry maps Deck units to artboard percentages independently of Interface Scale', () => {
  assert.match(visual, /frame\.x \/ canvas\.width/)
  assert.match(visual, /frame\.y \/ canvas\.height/)
  assert.match(visual, /frame\.width \/ canvas\.width/)
  assert.match(visual, /frame\.height \/ canvas\.height/)
  const renderComposition = visual.slice(visual.indexOf('function renderComposition'), visual.indexOf('function syncVisualControls'))
  assert.doesNotMatch(renderComposition, /interfaceScale|artboardZoom/)
  assert.match(ruleFor('#composition-layer'), /position:\s*absolute;/)
  assert.match(ruleFor('.composition-element'), /position:\s*absolute;/)
})
