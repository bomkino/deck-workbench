import { readPsd, writePsdUint8Array } from 'ag-psd'
import { resourceHandlers, resourceHandlersMap } from 'ag-psd/dist/imageResources.js'
import { readBytes } from 'ag-psd/dist/psdReader.js'
import { writeBytes } from 'ag-psd/dist/psdWriter.js'

// ag-psd 31.0.2 leaves ICC resource 1039 behind its disabled mock handlers.
// Keep this small adapter beside the pinned dependency rather than modifying it.
if (resourceHandlersMap[1039]) throw new Error('Review the PSD ICC adapter after updating ag-psd')
const iccHandler = {
  key: 1039,
  has: resources => resources.pitchdogICC instanceof Uint8Array,
  read: (reader, resources, left) => { resources.pitchdogICC = readBytes(reader, left()) },
  write: (writer, resources) => writeBytes(writer, resources.pitchdogICC),
}
resourceHandlers.push(iccHandler)
resourceHandlersMap[1039] = iccHandler

const options = { noBackground: true, generateThumbnail: false, trimImageData: false, compress: false }
const structureOptions = {
  skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true,
  skipLinkedFilesData: true, useImageData: true,
}
let session
const guidePathName = 'GRID NUMBERS - nonprinting'
const documentResolution = 144

// Saved paths are image resource 2000, using Adobe's 26-byte path records.
// These original geometric digits use no font data and never enter pixel layers.
function guideNumberPath() {
  const vertical = session.guides.filter(guide => guide.direction === 'vertical')
  const horizontal = session.guides.filter(guide => guide.direction === 'horizontal')
  if (vertical.length !== 48 || horizontal.length !== 24) throw new Error('The numbered grid requires 24 columns and 12 rows')
  const rectangles = []
  const digits = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgecd', 'abc', 'abcdefg', 'abfgcd']
  const segments = {
    a: [2, 0, 8, 2], b: [10, 2, 2, 7], c: [10, 11, 2, 7], d: [2, 18, 8, 2],
    e: [0, 11, 2, 7], f: [0, 2, 2, 7], g: [2, 9, 8, 2],
  }
  function label(number, centerX, centerY) {
    for (const [index, digit] of [...String(number).padStart(2, '0')].entries()) {
      for (const segment of digits[Number(digit)]) {
        const [x, y, width, height] = segments[segment]
        rectangles.push([centerX - 14 + index * 16 + x, centerY - 10 + y, width, height])
      }
    }
  }
  const marginX = vertical[0].location, marginY = horizontal[0].location
  for (let column = 0; column < 24; column++) {
    const center = (vertical[column * 2].location + vertical[column * 2 + 1].location) / 2
    label(column + 1, center, marginY / 2)
    label(column + 1, center, session.height - marginY / 2)
  }
  for (let row = 0; row < 12; row++) {
    const center = (horizontal[row * 2].location + horizontal[row * 2 + 1].location) / 2
    label(row + 1, marginX / 2, center)
    label(row + 1, session.width - marginX / 2, center)
  }
  const data = new Uint8Array((2 + rectangles.length * 5) * 26)
  const view = new DataView(data.buffer)
  view.setUint16(0, 6) // Even/odd fill rule.
  view.setUint16(26, 8) // Initial fill is empty, not a clipping path.
  let offset = 52
  for (const [x, y, width, height] of rectangles) {
    view.setUint16(offset, 0); view.setUint16(offset + 2, 4)
    offset += 26
    for (const [anchorX, anchorY] of [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]) {
      view.setUint16(offset, 1)
      for (let point = 0; point < 3; point++) {
        view.setInt32(offset + 2 + point * 8, Math.round(anchorY / session.height * 16777216))
        view.setInt32(offset + 6 + point * 8, Math.round(anchorX / session.width * 16777216))
      }
      offset += 26
    }
  }
  return data
}

function resourceSection(psd) {
  const view = new DataView(psd.buffer, psd.byteOffset, psd.byteLength)
  const lengthOffset = 30 + view.getUint32(26)
  const start = lengthOffset + 4, length = view.getUint32(lengthOffset)
  if (start + length > psd.length) throw new Error('Invalid PSD image resource bounds')
  return { view, lengthOffset, start, length, end: start + length }
}

function withGuideNumberPath(psd) {
  // ag-psd writes empty resource names. A named saved path therefore needs one
  // bounded insertion after serialization; all image/layer bytes stay exact.
  const section = resourceSection(psd)
  const nameBytes = (guidePathName.length + 2) & ~1
  const headerBytes = 6 + nameBytes + 4
  const block = new Uint8Array(headerBytes + session.guidePath.length)
  const view = new DataView(block.buffer)
  block.set([56, 66, 73, 77]) // 8BIM
  view.setUint16(4, 2000)
  block[6] = guidePathName.length
  for (let i = 0; i < guidePathName.length; i++) block[7 + i] = guidePathName.charCodeAt(i)
  view.setUint32(6 + nameBytes, session.guidePath.length)
  block.set(session.guidePath, headerBytes)
  const result = new Uint8Array(psd.length + block.length)
  result.set(psd.subarray(0, section.end))
  result.set(block, section.end)
  result.set(psd.subarray(section.end), section.end + block.length)
  new DataView(result.buffer).setUint32(section.lengthOffset, section.length + block.length)
  return result
}

function verifyGuideNumberPath(psd) {
  const section = resourceSection(psd)
  for (let offset = section.start; offset < section.end;) {
    const key = section.view.getUint16(offset + 4), nameLength = psd[offset + 6]
    const name = String.fromCharCode(...psd.subarray(offset + 7, offset + 7 + nameLength))
    const lengthOffset = offset + 6 + ((nameLength + 2) & ~1)
    const length = section.view.getUint32(lengthOffset), start = lengthOffset + 4
    if (start + length > section.end) throw new Error('Invalid saved path resource bounds')
    if (key === 2000) {
      const path = psd.subarray(start, start + length)
      if (name !== guidePathName || length !== session.guidePath.length ||
          path.some((byte, index) => byte !== session.guidePath[index])) throw new Error('PSD numbered guide path changed')
      return
    }
    offset = start + length + (length & 1)
  }
  throw new Error('PSD numbered guide path is missing')
}

function bytes(value, count, name) {
  if (!(value instanceof Uint8Array) || (count !== undefined && value.length !== count)) {
    throw new Error(`Invalid ${name} bytes`)
  }
  return value
}

function imageData(data) {
  return { width: session.width, height: session.height,
    data: bytes(data, session.width * session.height * 4, 'RGBA image') }
}

function layerPixels(data, rect) {
  if (rect.length !== 4 || rect.some(n => !Number.isInteger(n)) || rect[2] < 1 || rect[3] < 1 ||
      rect[2] > session.width || rect[3] > session.height) throw new Error('Invalid layer pixel bounds')
  return { width: rect[2], height: rect[3], data: bytes(data, rect[2] * rect[3] * 4, 'layer RGBA') }
}

function resources() {
  return {
    pitchdogICC: session.icc,
    resolutionInfo: {
      horizontalResolution: documentResolution, horizontalResolutionUnit: 'PPI',
      verticalResolution: documentResolution, verticalResolutionUnit: 'PPI',
      widthUnit: 'Inches', heightUnit: 'Inches',
    },
    gridAndGuidesInformation: { guides: session.guides },
  }
}

function verify(data, names, expectedFiles) {
  verifyGuideNumberPath(data)
  const parsed = readPsd(data, { ...structureOptions, skipLinkedFilesData: !expectedFiles })
  const resolution = parsed.imageResources?.resolutionInfo
  if (resolution?.horizontalResolution !== documentResolution || resolution?.verticalResolution !== documentResolution) {
    throw new Error('PSD verification failed: document resolution changed')
  }
  if (parsed.width !== session.width || parsed.height !== session.height || parsed.bitsPerChannel !== 8 ||
      parsed.children.length !== names.length || parsed.children.some((layer, i) => layer.name !== names[i])) {
    throw new Error('PSD verification failed: dimensions or layer structure changed')
  }
  const guides = parsed.imageResources?.gridAndGuidesInformation?.guides
  const profile = parsed.imageResources?.pitchdogICC
  if (guides?.length !== session.guides.length || guides.some((g, i) =>
      g.location !== session.guides[i].location || g.direction !== session.guides[i].direction) ||
      profile?.length !== session.icc.length || profile.some((byte, i) => byte !== session.icc[i])) {
    throw new Error('PSD verification failed: guide or colour profile data is missing')
  }
  if (expectedFiles) {
    if ((parsed.linkedFiles?.length ?? 0) !== expectedFiles.length) throw new Error('PSD embedded source count changed')
    for (const expected of expectedFiles) {
      const actual = parsed.linkedFiles.find(file => file.id === expected.id)
      if (actual?.data?.length !== expected.data.length || actual.data.some((byte, i) => byte !== expected.data[i])) {
        throw new Error(`PSD embedded original bytes changed: ${expected.name}`)
      }
    }
  }
  return parsed
}

globalThis.PitchdogPSD = {
  version: '1',
  start(json, icc) {
    const input = JSON.parse(json)
    if (![1920, 2576].includes(input.width) || input.height !== 1080 ||
        typeof input.cropToFrames !== 'boolean' || input.guides?.length !== 72 || input.guides.some(g => !Number.isFinite(g.location) ||
          !['vertical', 'horizontal'].includes(g.direction) || !Number.isInteger(g.location * 32))) {
      throw new Error('PSD export requires a supported canvas and exact 24 by 12 guides')
    }
    session = { ...input, icc: bytes(icc, undefined, 'ICC'), layers: [], files: new Map() }
    if (session.icc.length < 128) throw new Error('The sRGB ICC profile is missing')
    session.guidePath = guideNumberPath()
    return true
  },
  addLayer(json, original, pixels, mask) {
    if (!session) throw new Error('PSD export has not started')
    const input = JSON.parse(json)
    if (session.layers.length >= 12 || !input.id || !input.placed ||
        !(input.sourceWidth > 0) || !(input.sourceHeight > 0) ||
        input.transform.length !== 8 || input.transform.some(n => !Number.isFinite(n))) {
      throw new Error('Invalid placed artwork')
    }
    if (!session.files.has(input.id)) {
      session.files.set(input.id, {
        id: input.id, name: input.filename, type: input.fileType,
        data: bytes(original, undefined, 'original image'),
      })
    }
    session.layers.push({
      id: session.layers.length + 1, name: input.name, top: input.pixelRect[1], left: input.pixelRect[0],
      imageData: layerPixels(pixels, input.pixelRect),
      mask: { top: input.maskRect[1], left: input.maskRect[0], defaultColor: 0,
        disabled: !session.cropToFrames,
        positionRelativeToLayer: false, imageData: layerPixels(mask, input.maskRect) },
      placedLayer: {
        id: input.id, placed: input.placed, type: 'raster',
        width: input.sourceWidth, height: input.sourceHeight,
        // Source-file placement metadata is separate from deck canvas resolution.
        transform: input.transform, resolution: { value: 72, units: 'Density' },
      },
    })
    return true
  },
  finish(innerPixels, outerPixels) {
    if (!session) throw new Error('PSD export has not started')
    const composite = imageData(innerPixels)
    if (!session.layers.length) {
      session.layers.push({ id: 1, name: 'Place artwork here', top: 0, left: 0, imageData: composite })
    }
    const inner = withGuideNumberPath(writePsdUint8Array({
      width: session.width, height: session.height, imageData: composite,
      children: session.layers, linkedFiles: [...session.files.values()], imageResources: resources(),
    }, options))
    const parsedInner = verify(inner, session.layers.map(layer => layer.name), [...session.files.values()])
    for (const [index, layer] of parsedInner.children.entries()) {
      const expected = session.layers[index]
      if (!expected.placedLayer) continue
      if (!layer.mask || layer.mask.disabled !== !session.cropToFrames ||
          layer.placedLayer?.id !== expected.placedLayer.id ||
          layer.placedLayer?.transform?.some((value, i) => value !== expected.placedLayer.transform[i])) {
        throw new Error('PSD verification failed: editable framing mask or image placement changed')
      }
    }
    // Drop the native per-role previews and originals before serializing the outer PSD.
    session.layers = []
    session.files.clear()
    const placement = {
      id: session.sharedID, type: 'raster', width: session.width, height: session.height,
      transform: [0, 0, session.width, 0, session.width, session.height, 0, session.height],
      resolution: { value: documentResolution, units: 'Density' },
    }
    const names = ['00.Background', '01.Character']
    const result = withGuideNumberPath(writePsdUint8Array({
      width: session.width, height: session.height, imageData: imageData(outerPixels),
      children: names.map((name, index) => ({
        id: index + 1, name, top: 0, left: 0, hidden: false, imageData: composite,
        placedLayer: { ...placement, placed: session.instanceIDs[index] },
      })),
      linkedFiles: [{ id: session.sharedID, name: 'Shared Artwork.psd', type: '8BPS', data: inner }],
      imageResources: resources(),
    }, options))
    const parsed = verify(result, names)
    if (parsed.linkedFiles?.length !== 1 || parsed.children.some(layer =>
      layer.placedLayer?.id !== session.sharedID || layer.placedLayer?.resolution?.value !== documentResolution)) {
      throw new Error('PSD verification failed: the two roles do not share one embedded source')
    }
    session = undefined
    return result
  },
}
