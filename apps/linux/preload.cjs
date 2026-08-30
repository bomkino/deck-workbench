'use strict'

const { contextBridge, ipcRenderer } = require('electron')

function invoke(method, payload = {}) {
  return ipcRenderer.invoke(`deck-workbench:${method}`, payload)
}

// Keep this surface in exact parity with packages/bridge-contract/bridge.contract.json.
// There is intentionally no generic invoke, filesystem, process, shell or network API.
const deckBridge = Object.freeze({
  create: (payload = {}) => invoke('deck.create', payload),
  open: (payload = {}) => invoke('deck.open', payload),
  query: (payload = {}) => invoke('deck.query', payload),
  execute: (payload = {}) => invoke('deck.execute', payload),
  undo: (payload = {}) => invoke('deck.undo', payload),
  redo: (payload = {}) => invoke('deck.redo', payload),
  exportPDF: (payload = {}) => invoke('deck.exportPDF', payload),
  getPreferences: (payload = {}) => invoke('ui.getPreferences', payload),
  setTheme: (payload = {}) => invoke('ui.setTheme', payload),
  setInterfaceScale: (payload = {}) => invoke('ui.setInterfaceScale', payload),
  setArtboardZoom: (payload = {}) => invoke('ui.setArtboardZoom', payload),
})

contextBridge.exposeInMainWorld('deckBridge', deckBridge)
