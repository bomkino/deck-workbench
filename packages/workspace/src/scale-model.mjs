export const INTERFACE_SCALE_STEPS = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75])
export const ARTBOARD_BASE_WIDTH = 1088

export function normalizeInterfaceScale(value) {
  const numeric = Number(value)
  if (!INTERFACE_SCALE_STEPS.includes(numeric)) {
    throw new RangeError('Interface Scale must use an allowed step')
  }
  return numeric
}

export function normalizeArtboardZoom(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0.1 || numeric > 4) {
    throw new RangeError('Artboard zoom must be between 10% and 400%')
  }
  return numeric
}

export function workspaceTransforms({ interfaceScale, artboardZoom, canvas }) {
  const ui = normalizeInterfaceScale(interfaceScale)
  const zoom = normalizeArtboardZoom(artboardZoom)
  if (
    !canvas
    || !Number.isFinite(canvas.width)
    || !Number.isFinite(canvas.height)
    || canvas.width <= 0
    || canvas.height <= 0
  ) {
    throw new TypeError('Canvas geometry is required')
  }
  return Object.freeze({
    interfaceScale: ui,
    chromeRemPixels: 16 * ui,
    artboardTransform: `scale(${zoom})`,
    artboardViewport: Object.freeze({
      width: ARTBOARD_BASE_WIDTH * zoom,
      height: (ARTBOARD_BASE_WIDTH * canvas.height / canvas.width) * zoom,
    }),
    exportGeometry: Object.freeze({ width: canvas.width, height: canvas.height }),
  })
}
