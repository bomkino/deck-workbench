const listener = () => {}
function fakeElement(dataset = {}) {
  const target = {
    dataset,
    value: '',
    checked: false,
    hidden: false,
    open: false,
    disabled: false,
    clientWidth: 1200,
    clientHeight: 800,
    scrollTop: 0,
    style: { setProperty: listener },
    classList: { add: listener, remove: listener, toggle: listener, contains: () => false },
    addEventListener: listener,
    removeEventListener: listener,
    setAttribute: listener,
    getAttribute: () => null,
    focus: listener,
    showModal() { this.open = true },
    close() { this.open = false },
    querySelector: () => fakeElement(),
    querySelectorAll: () => [],
    closest: () => null,
    append: listener,
    appendChild: listener,
    click: listener,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
  }
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property]
      return undefined
    },
    set(object, property, value) {
      object[property] = value
      return true
    },
  })
}

const phaseButtons = ['plan', 'curate', 'assemble', 'handoff'].map((phase) => fakeElement({ phase }))
const phaseViews = ['plan', 'curate', 'assemble', 'handoff'].map((view) => fakeElement({ view }))
const queueFilters = ['all', 'needs', 'find-more', 'ready'].map((queueFilter) => fakeElement({ queueFilter }))
const tools = ['select', 'hand', 'crop', 'gradient'].map((tool) => fakeElement({ tool }))
const handoffFilters = ['all', 'blocked', 'review', 'find-more', 'ready', 'skipped'].map((handoffFilter) => fakeElement({ handoffFilter }))

globalThis.document = {
  querySelector(selector) {
    if (selector === '.phase-button') return phaseButtons[0]
    return fakeElement()
  },
  querySelectorAll(selector) {
    if (selector === '.phase-button') return phaseButtons
    if (selector === '.phase-view') return phaseViews
    if (selector === '[data-queue-filter]') return queueFilters
    if (selector === '[data-tool]') return tools
    if (selector === '[data-handoff-filter]') return handoffFilters
    return []
  },
  addEventListener: listener,
  createElement: () => fakeElement(),
}
globalThis.window = {
  confirm: () => true,
  addEventListener: listener,
  innerWidth: 1600,
  innerHeight: 1000,
  setTimeout,
  clearTimeout,
}
globalThis.localStorage = {
  getItem: () => null,
  setItem: listener,
  removeItem: listener,
}
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: { writeText: async () => {} } }, configurable: true })
globalThis.ResizeObserver = class { constructor(callback) { this.callback = callback } observe() {} disconnect() {} }
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0)
globalThis.URL.createObjectURL = () => 'blob:fake'
globalThis.URL.revokeObjectURL = listener

authoriseImport()

async function authoriseImport() {
  const { readFile } = await import('node:fs/promises')
  const { runInThisContext } = await import('node:vm')
  const { fixture } = await import('./fixture.mjs')
  const workflowModel = await import('../../packages/workflow-model/index.mjs')
  globalThis.WB_DEPS = { fixture, workflowModel }
  for (const source of [
    'app-core-runtime.js',
    'app-core-setup.js',
    'app-plan-events.js',
    'app-plan-render.js',
    'app-plan-editor.js',
    'app-plan-import.js',
    'app-curate-ui.js',
    'app-curate-decisions.js',
    'app-curate-preview.js',
    'app-assemble-events.js',
    'app-assemble-render.js',
    'app-assemble-interaction.js',
    'app-assemble-actions.js',
    'app-handoff.js',
    'app-helpers.js',
    'app-start.js',
  ]) {
    runInThisContext(await readFile(new URL(source, import.meta.url), 'utf8'), { filename: source })
  }
  console.log('Phased Workbench classic phase scripts imported through smoke DOM')
}
