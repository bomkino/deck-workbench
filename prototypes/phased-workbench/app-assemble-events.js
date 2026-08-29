function bindAssemblyEvents() {
  elements.assemblySlideList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-slide-id]')
    if (!button) return
    selectSlide(button.dataset.slideId)
    renderAssembly()
  })
  elements.assemblyToolbarTools.forEach((button) => button.addEventListener('click', () => {
    state.assemble.tool = button.dataset.tool
    state.assemble.selection = button.dataset.tool === 'gradient' ? 'gradient' : button.dataset.tool === 'crop' ? 'image' : state.assemble.selection
    saveState()
    renderAssembly()
  }))
  elements.toggleGrid.addEventListener('click', () => toggleAssemblyView('showGrid'))
  elements.toggleSnap.addEventListener('click', () => toggleAssemblyView('snap'))
  elements.toggleGuides.addEventListener('click', () => toggleAssemblyView('smartGuides'))
  elements.toggleCleanPreview.addEventListener('click', () => toggleAssemblyView('cleanPreview'))
  elements.zoomOut.addEventListener('click', () => setZoom(state.artboardZoom - 0.05))
  elements.zoomIn.addEventListener('click', () => setZoom(state.artboardZoom + 0.05))
  elements.fitArtboard.addEventListener('click', fitArtboard)

  elements.typeScaleTokens.addEventListener('click', (event) => {
    const token = event.target.closest('[data-type-token]')?.dataset.typeToken
    if (!token) return
    commit(`Text scale ${token}`, (draft) => {
      const assembly = activeDraftAssembly(draft)
      assembly.text.scaleToken = token
      assembly.text.opticalMultiplier = 1
      assembly.text.layoutSnapshotState = 'stale'
    })
  })
  elements.bodyColumns.addEventListener('change', () => {
    commit(`Body columns ${elements.bodyColumns.value}`, (draft) => {
      const assembly = activeDraftAssembly(draft)
      assembly.text.columns = Number(elements.bodyColumns.value)
      assembly.text.layoutSnapshotState = 'stale'
    })
  })
  bindRange(elements.columnGap, 'column-gap', 'Column gap adjusted', (draft, value) => {
    activeDraftAssembly(draft).text.columnGap = value
    activeDraftAssembly(draft).text.layoutSnapshotState = 'stale'
  })
  elements.resetText.addEventListener('click', () => {
    commit('Text Stack reset', (draft) => {
      const assembly = activeDraftAssembly(draft)
      assembly.text = { ...assembly.text, x: 260, y: 600, width: 1650, height: 330, scaleToken: 'M', opticalMultiplier: 1, columns: 1, columnGap: 64, layoutSnapshotState: 'stale' }
    })
  })
  bindRange(elements.imageScale, 'image-scale', 'Image scale adjusted', (draft, value) => {
    activeDraftAssembly(draft).image.scale = value
  })
  elements.centreImage.addEventListener('click', () => {
    commit('Image centred', (draft) => {
      const image = activeDraftAssembly(draft).image
      image.panX = 0
      image.panY = 0
    })
  })
  elements.resetImage.addEventListener('click', () => {
    commit('Image crop reset', (draft) => {
      activeDraftAssembly(draft).image = { ...activeDraftAssembly(draft).image, panX: 0, panY: 0, scale: 1 }
    })
  })
  elements.sourceTreatment.addEventListener('change', () => {
    commit('Source treatment changed', (draft) => {
      const slide = draft.slides.find((candidate) => candidate.id === draft.selectedSlideId)
      slide.sourceTreatment = elements.sourceTreatment.value
      activeDraftAssembly(draft).image.sourceTreatment = elements.sourceTreatment.value
    })
  })
  elements.demotePrimaryShortlist.addEventListener('click', () => demoteFirstPrimary('demote-to-shortlist'))
  elements.demotePrimaryAlternate.addEventListener('click', () => demoteFirstPrimary('demote-to-alternate'))

  elements.gradientPresets.addEventListener('click', (event) => {
    const presetName = event.target.closest('[data-gradient-preset]')?.dataset.gradientPreset
    if (!presetName) return
    applyGradientPreset(presetName)
  })
  bindRange(elements.gradientFeather, 'gradient-feather', 'Gradient feather adjusted', (draft, value) => {
    activeDraftAssembly(draft).gradient.feather = value
    activeDraftAssembly(draft).gradient.preset = 'custom'
  })
  bindRange(elements.gradientOpacity, 'gradient-opacity', 'Gradient opacity adjusted', (draft, value) => {
    activeDraftAssembly(draft).gradient.opacity = value
    activeDraftAssembly(draft).gradient.preset = 'custom'
  })
  elements.gradientEnabled.addEventListener('change', () => {
    commit('Gradient toggled', (draft) => {
      activeDraftAssembly(draft).gradient.enabled = elements.gradientEnabled.checked
    })
  })
  elements.designerNotes.addEventListener('change', () => {
    commit('Designer Notes updated', (draft) => {
      activeDraftAssembly(draft).designerNotes = elements.designerNotes.value
    })
  })
  elements.findMoreState.addEventListener('change', () => {
    commit('Find More state changed', (draft) => {
      const slide = draft.slides.find((candidate) => candidate.id === draft.selectedSlideId)
      slide.findMoreMedia.state = elements.findMoreState.value
    })
  })
  elements.findMoreBrief.addEventListener('change', () => {
    commit('Find More brief updated', (draft) => {
      const slide = draft.slides.find((candidate) => candidate.id === draft.selectedSlideId)
      slide.findMoreMedia.brief = elements.findMoreBrief.value
    })
  })

  elements.textStack.addEventListener('pointerdown', (event) => {
    if (event.target === elements.textResizeHandle) return
    if (state.assemble.tool === 'hand') return
    event.stopPropagation()
    state.assemble.selection = 'text'
    startAssemblyDrag('text-move', event)
  })
  elements.textResizeHandle.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
    state.assemble.selection = 'text'
    startAssemblyDrag('text-resize', event)
  })
  elements.imageLayer.addEventListener('pointerdown', (event) => {
    if (state.assemble.tool === 'hand') return
    if (event.target.closest('.assembly-image-slot')) {
      state.assemble.selection = 'image'
      startAssemblyDrag('image-pan', event)
    }
  })
  elements.artboard.addEventListener('pointerdown', (event) => {
    if (event.target.closest('#text-stack, .assembly-image-slot, .gradient-handle')) return
    if (state.assemble.tool === 'hand') startAssemblyDrag('stage-pan', event)
    else {
      state.assemble.selection = null
      renderArtboard()
      renderAssemblyInspector()
    }
  })
  elements.interactionOverlay.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('[data-gradient-handle]')
    if (!handle) return
    event.stopPropagation()
    state.assemble.selection = 'gradient'
    startAssemblyDrag(`gradient-${handle.dataset.gradientHandle}`, event)
  })
  elements.stageViewport.addEventListener('wheel', (event) => {
    if (!event.metaKey && !event.ctrlKey) return
    event.preventDefault()
    setZoom(state.artboardZoom + (event.deltaY < 0 ? 0.04 : -0.04))
  }, { passive: false })

  elements.assemblyPrimaryTray.addEventListener('click', handleAssemblyTrayClick)
  elements.assemblyAlternateTray.addEventListener('click', handleAssemblyTrayClick)
  elements.assemblyShortlistTray.addEventListener('click', handleAssemblyTrayClick)
  elements.projectPicksTray.addEventListener('click', handleAssemblyTrayClick)

  window.addEventListener('pointermove', handleAssemblyPointerMove)
  window.addEventListener('pointerup', finishAssemblyDrag)
  window.addEventListener('pointercancel', finishAssemblyDrag)
  new ResizeObserver(() => {
    if (state.phase === 'assemble') fitArtboard(false)
  }).observe(elements.stageViewport)
}
