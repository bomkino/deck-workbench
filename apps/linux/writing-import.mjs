import { randomUUID } from 'node:crypto'

export const writingImportLimits = Object.freeze({
  payloadBytes: 786432,
  deckTitleCharacters: 240,
  partTitleCharacters: 240,
  slideTitleCharacters: 240,
  purposeCharacters: 4096,
  copyFieldCharacters: 262144,
  partCount: 200,
  slideCount: 1000,
})

const canvasIds = new Set([
  'cinemascope-2576x1080',
  'widescreen-1920x1080',
  'square-2160x2160',
  'standard-1920x1440',
  'a4-portrait',
  'letter-portrait',
])
const styleIds = new Set([
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
const contentPatternIds = new Set([
  'simple-copy',
  'quote',
  'repeater',
  'comparison',
  'gallery-captions',
  'no-on-slide-text',
  'custom',
])
const copyStates = new Set(['present', 'intentionally-blank', 'unreviewed'])

function invalid(message) {
  return Object.assign(new Error(message), { name: 'InvalidCommand' })
}

function record(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${field} must be an object`)
  return value
}

function exactKeys(value, allowed, field) {
  const names = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!names.has(key)) throw invalid(`${field} contains unknown field ${key}`)
  }
}

function text(value, field, max) {
  if (typeof value !== 'string' || value.length === 0) throw invalid(`${field} must be a non-empty string`)
  if (value.length > max) throw invalid(`${field} exceeds ${max} characters`)
  return value
}

function copyField(value, role) {
  const copy = record(value, `writingImport ${role}`)
  exactKeys(copy, ['state', 'value'], `writingImport ${role}`)
  if (!copyStates.has(copy.state)) throw invalid(`writingImport ${role} state is unsupported`)
  if (typeof copy.value !== 'string') throw invalid(`writingImport ${role} value must be a string`)
  if (copy.value.length > writingImportLimits.copyFieldCharacters) {
    throw invalid(`writingImport ${role} exceeds copy-field limit`)
  }
  if (copy.state === 'present' && !/\S/u.test(copy.value)) throw invalid(`writingImport ${role} is present but empty`)
  if (copy.state !== 'present' && copy.value !== '') {
    throw invalid(`writingImport ${role} ${copy.state} state cannot contain copy`)
  }
  return { state: copy.state, value: copy.value }
}

export function validateWritingImport(value) {
  const payload = record(value, 'writingImport')
  exactKeys(payload, ['format', 'title', 'canvas', 'parts'], 'writingImport')
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > writingImportLimits.payloadBytes) {
    throw invalid(`writingImport exceeds payload byte limit of ${writingImportLimits.payloadBytes}`)
  }
  if (payload.format !== 'workbench-markdown/1') throw invalid('writingImport format must be workbench-markdown/1')
  const title = text(payload.title, 'writingImport title', writingImportLimits.deckTitleCharacters)
  if (!canvasIds.has(payload.canvas)) throw invalid('writingImport canvas is unsupported')
  if (!Array.isArray(payload.parts) || payload.parts.length === 0) throw invalid('writingImport must contain at least one Part')
  if (payload.parts.length > writingImportLimits.partCount) {
    throw invalid(`writingImport exceeds Part limit of ${writingImportLimits.partCount}`)
  }
  let slideCount = 0
  const parts = payload.parts.map((rawPart, partIndex) => {
    const part = record(rawPart, `writingImport Part ${partIndex + 1}`)
    exactKeys(part, ['title', 'purpose', 'slides'], `writingImport Part ${partIndex + 1}`)
    const partTitle = text(part.title, `writingImport Part ${partIndex + 1} title`, writingImportLimits.partTitleCharacters)
    const purpose = text(part.purpose, `writingImport Part ${partIndex + 1} purpose`, writingImportLimits.purposeCharacters)
    if (!Array.isArray(part.slides) || part.slides.length === 0) {
      throw invalid(`writingImport Part ${partIndex + 1} must contain at least one Slide`)
    }
    const slides = part.slides.map((rawSlide) => {
      slideCount += 1
      if (slideCount > writingImportLimits.slideCount) {
        throw invalid(`writingImport exceeds Slide limit of ${writingImportLimits.slideCount}`)
      }
      const slide = record(rawSlide, `writingImport Slide ${slideCount}`)
      exactKeys(slide, ['title', 'purpose', 'style', 'contentPattern', 'copies'], `writingImport Slide ${slideCount}`)
      const slideTitle = text(slide.title, `writingImport Slide ${slideCount} title`, writingImportLimits.slideTitleCharacters)
      const slidePurpose = text(slide.purpose, `writingImport Slide ${slideCount} purpose`, writingImportLimits.purposeCharacters)
      if (!styleIds.has(slide.style)) throw invalid(`writingImport Slide ${slideCount} Style is unsupported`)
      if (!contentPatternIds.has(slide.contentPattern)) {
        throw invalid(`writingImport Slide ${slideCount} Content pattern is unsupported`)
      }
      const copies = record(slide.copies, `writingImport Slide ${slideCount} copies`)
      exactKeys(copies, ['headline', 'subheadline', 'body'], `writingImport Slide ${slideCount} copies`)
      return {
        title: slideTitle,
        purpose: slidePurpose,
        style: slide.style,
        contentPattern: slide.contentPattern,
        copies: {
          headline: copyField(copies.headline, 'headline'),
          subheadline: copyField(copies.subheadline, 'subheadline'),
          body: copyField(copies.body, 'body'),
        },
      }
    })
    return { title: partTitle, purpose, slides }
  })
  return { format: 'workbench-markdown/1', title, canvas: payload.canvas, parts }
}

export function seedWritingImport(value, createId = randomUUID) {
  const writingImport = validateWritingImport(value)
  return {
    deckId: createId(),
    writingImport: {
      ...writingImport,
      parts: writingImport.parts.map((part) => ({
        ...part,
        id: createId(),
        slides: part.slides.map((slide) => ({
          ...slide,
          id: createId(),
          planBlockId: createId(),
          copies: {
            headline: { ...slide.copies.headline, blockId: createId() },
            subheadline: {
              ...slide.copies.subheadline,
              ...(slide.copies.subheadline.state === 'present' ? { blockId: createId() } : {}),
            },
            body: {
              ...slide.copies.body,
              ...(slide.copies.body.state === 'present' ? { blockId: createId() } : {}),
            },
          },
        })),
      })),
    },
  }
}
