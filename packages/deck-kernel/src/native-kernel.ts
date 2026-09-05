// Native prototype metadata, not another document store. Every edit participates
// in the same kernel validation, atomic journal operation and undo history.
type NativeLayout = {
  preset: string; columns: number; bodySize: number; fitCopy: boolean
  textFrame?: ElementFrame
  frames: Record<string, ElementFrame>; crops: Record<string, NormalizedCrop>
  imageFits: Record<string, ElementImageFit>; gradient?: ElementGradient
}
type NativeSlideState = {
  version: 1; copyLocked: boolean; notes: string; included: boolean
  shortlist: string[]; rejected: string[]; sourceFingerprints: Record<string, string>
  layout: NativeLayout
}
type NativeMutation = { forward: HistoryOperation; inverse: HistoryOperation; label: string; noop?: boolean }

function nativePlan(slide: Slide): JsonObject {
  const block = slide.contentBlocks.find((b) => b.role === 'workbench-plan' || b.semanticKey === 'workbench.plan.v1')
  try { return block ? JSON.parse(richTextToPlainText(block.value)) : {} } catch { return {} }
}
function nativeState(deck: DeckSnapshot, slide: Slide): NativeSlideState {
  if (slide.native) return clone(slide.native)
  const legacy = ownValue(deck.workbenchCurate?.slides, slide.id)?.decisions ?? {}
  const option = slide.designOptions?.find((o) => o.id === slide.activeDesignOptionId)
  let authored = Boolean(option)
  if (option?.planSnapshot) {
    try { authored = JSON.stringify(option.composition) !== JSON.stringify(instantiatePlanAssembly(deck, slide, option.id).composition) } catch {}
  }
  return {
    version: 1, copyLocked: true, notes: '', included: !['cut', 'skipped'].includes(String(nativePlan(slide).lifecycle ?? 'included')),
    shortlist: Object.entries(legacy).filter(([, d]) => ['shortlisted', 'alternate', 'unplaced'].includes(d.state)).map(([id]) => id),
    rejected: Object.entries(legacy).filter(([, d]) => d.state === 'rejected-for-slide').map(([id]) => id),
    sourceFingerprints: {}, layout: { preset: authored ? 'legacy' : 'auto', columns: 1, bodySize: 32, fitCopy: true, frames: {}, crops: {}, imageFits: {} },
  }
}
// Visible slots follow an explicit prototype layout, never obsolete assignments.
function nativeImageRoles(slide: Slide, state: NativeSlideState): string[] {
  const preset = state.layout.preset === 'auto'
    ? (slide.intent === 'text-only' ? 'text-only' : slide.intent === 'triptych' ? 'three-images' : slide.intent === 'diptych' ? 'two-images' : 'left')
    : state.layout.preset
  if (preset === 'text-only') return []
  if (preset === 'legacy') {
    const option = slide.designOptions?.find((o) => o.id === slide.activeDesignOptionId)
    const roles = (option?.composition.elements ?? []).filter((e) => e.kind === 'image').map((e) => e.mediaRole).filter((r): r is string => typeof r === 'string')
    return [...new Set(roles.length ? roles : (slide.mediaAssignments ?? []).map((a) => a.role))]
  }
  const count = preset === 'three-images' ? 3 : preset === 'two-images' ? 2 : 1
  return Array.from({ length: count }, (_, i) => i ? `primary:${i + 1}` : 'primary')
}

function nativeNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${field} is outside ${min}–${max}`)
  return value
}
function nativeText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 262144) throw new Error('Notes must contain at most 262144 characters')
  return value
}
function validateNativeState(value: unknown, deck?: DeckSnapshot): NativeSlideState {
  const state = assertRecord(value, 'Native Slide') as unknown as NativeSlideState
  if (state.version !== 1 || typeof state.copyLocked !== 'boolean' || typeof state.included !== 'boolean') throw new Error('Unsupported native Slide state')
  nativeText(state.notes)
  const assets = deck ? new Set((deck.assetReferences ?? []).map((a) => a.id)) : null
  for (const key of ['shortlist', 'rejected'] as const) {
    if (!Array.isArray(state[key]) || state[key].length > 12000 || new Set(state[key]).size !== state[key].length) throw new Error(`${key} needs unique Asset IDs`)
    for (const id of state[key]) { assertIdentity(id, 'Asset ID', 256); if (assets && !assets.has(id)) throw new Error('Native candidate Asset does not exist') }
  }
  for (const [id, fingerprint] of Object.entries(assertRecord(state.sourceFingerprints, 'sourceFingerprints'))) {
    assertIdentity(id, 'Asset ID', 256); assertString(fingerprint, 'fingerprint', 500)
    if (assets && !assets.has(id)) throw new Error('Pinned source Asset does not exist')
  }
  const layout = assertRecord(state.layout, 'layout') as unknown as NativeLayout
  if (!['auto', 'legacy', 'left', 'right', 'lower', 'wide', 'text-only', 'image-only', 'two-images', 'three-images'].includes(layout.preset)) throw new Error('Unsupported prototype layout')
  if (![1, 2, 3].includes(layout.columns) || typeof layout.fitCopy !== 'boolean') throw new Error('Invalid text flow settings')
  nativeNumber(layout.bodySize, 'bodySize', 16, 80)
  if (layout.textFrame) assertElementFrame(layout.textFrame)
  for (const [id, frame] of Object.entries(assertRecord(layout.frames, 'frames'))) { assertIdentity(id, 'frame ID', 512); assertElementFrame(frame) }
  for (const [id, crop] of Object.entries(assertRecord(layout.crops, 'crops'))) { assertIdentity(id, 'crop ID', 512); assertNormalizedCrop(crop) }
  for (const [id, fit] of Object.entries(assertRecord(layout.imageFits, 'imageFits'))) { assertIdentity(id, 'image role', 512); assertElementImageFit(fit) }
  if (layout.gradient) assertElementGradient(layout.gradient)
  return clone(state)
}
function validateNativeDeck(deck: DeckSnapshot): void {
  for (const section of deck.sections) for (const slide of section.slides) if (slide.native) validateNativeState(slide.native, deck)
}
function nativeMutation(deck: DeckSnapshot, slide: Slide, next: NativeSlideState, label: string): NativeMutation {
  validateNativeState(next)
  return { forward: { type: 'native.slide.set', payload: { slideId: slide.id, value: next } }, inverse: { type: 'native.slide.set', payload: { slideId: slide.id, value: slide.native ? clone(slide.native) : null } }, label,
    noop: JSON.stringify(nativeState(deck, slide)) === JSON.stringify(next) }
}
function prepareNativeCommand(deck: DeckSnapshot, command: CommandEnvelope): NativeMutation {
  if (command.type === 'native.layout.apply') {
    const ids = command.payload.slideIds
    if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || new Set(ids).size !== ids.length) throw new Error('Select unique slides for the layout')
    const layout = assertRecord(command.payload.layout, 'layout')
    const forward: HistoryOperation[] = [], inverse: HistoryOperation[] = []
    let firstMutation: NativeMutation | undefined
    for (const slideId of ids) {
      const m = prepareNativeCommand(deck, { ...command, type: 'native.slide.patch', payload: { slideId, patch: { layout } } })
      firstMutation ??= m
      if (!m.noop) appendOperationPair(forward, inverse, m.forward, m.inverse)
    }
    if (!forward.length) return { ...firstMutation!, label: 'Apply prototype arrangement', noop: true }
    return { forward: operationList(forward), inverse: operationList(inverse), label: 'Apply prototype arrangement' }
  }
  if (command.type === 'native.copy.replace') {
    const updates = command.payload.slides
    if (!Array.isArray(updates) || !updates.length || updates.length > 1000) throw new Error('Copy replacement needs Slide updates')
    const forward: HistoryOperation[] = [], inverse: HistoryOperation[] = [], seen = new Set<string>()
    for (const raw of updates) {
      const update = assertRecord(raw, 'copy update'), id = assertIdentity(update.slideId, 'slideId', 256), slide = findSlide(deck, id)
      if (!slide || seen.has(id) || !Array.isArray(update.blocks)) throw new Error('Unknown or duplicated copy destination')
      seen.add(id)
      const metadata = (b: ContentBlock) => b.role.startsWith('workbench-') || b.semanticKey.startsWith('workbench.')
      const oldBlocks = slide.contentBlocks.filter((b) => !metadata(b)), blocks = update.blocks as ContentBlock[]
      const ids = new Set<string>(), keys = new Set<string>()
      for (const b of blocks) {
        assertIdentity(b.id, 'Content ID', 256); assertString(b.role, 'role'); assertString(b.semanticKey, 'semanticKey')
        if (metadata(b) || !isRichTextDocument(b.value) || ids.has(b.id) || keys.has(b.semanticKey)) throw new Error('Invalid replacement Content Block')
        if (blockIdentityExists(deck, b.id) && !oldBlocks.some((o) => o.id === b.id)) throw new Error('Content ID belongs to another Slide')
        ids.add(b.id); keys.add(b.semanticKey)
      }
      for (const b of oldBlocks.slice().reverse()) {
        const index = slide.contentBlocks.findIndex((o) => o.id === b.id)
        appendOperationPair(forward, inverse, { type: 'content.remove', payload: { slideId: id, blockId: b.id } }, { type: 'content.insert', payload: { slideId: id, block: clone(b), afterBlockId: slide.contentBlocks[index - 1]?.id ?? null } })
      }
      let anchor = slide.contentBlocks.filter(metadata).at(-1)?.id ?? null
      for (const b of blocks) {
        appendOperationPair(forward, inverse, { type: 'content.insert', payload: { slideId: id, block: clone(b), afterBlockId: anchor } }, { type: 'content.remove', payload: { slideId: id, blockId: b.id } }); anchor = b.id
      }
      const state = nativeState(deck, slide); state.copyLocked = true
      const m = nativeMutation(deck, slide, state, 'Replace final copy'); appendOperationPair(forward, inverse, m.forward, m.inverse)
    }
    return { forward: operationList(forward), inverse: operationList(inverse), label: 'Replace final copy' }
  }
  const id = assertIdentity(command.payload.slideId, 'slideId', 256), slide = findSlide(deck, id)
  if (!slide) throw new Error('Slide does not exist')
  const state = nativeState(deck, slide)
  if (command.type === 'native.slide.patch') {
    const patch = assertRecord(command.payload.patch, 'patch')
    if (Object.keys(patch).some((k) => !['notes', 'included', 'copyLocked', 'layout'].includes(k))) throw new Error('Unsupported native Slide property')
    if (patch.notes !== undefined) state.notes = nativeText(patch.notes)
    for (const k of ['included', 'copyLocked'] as const) if (patch[k] !== undefined) { if (typeof patch[k] !== 'boolean') throw new Error(`${k} must be boolean`); state[k] = patch[k] as boolean }
    const forward: HistoryOperation[] = [], inverse: HistoryOperation[] = []
    if (patch.layout !== undefined) {
      const layout = assertRecord(patch.layout, 'layout patch')
      if (Object.keys(layout).some((k) => !['preset', 'columns', 'bodySize', 'fitCopy', 'textFrame', 'frames', 'crops', 'imageFits', 'gradient'].includes(k))) throw new Error('Unsupported layout property')
      const previousPreset = state.layout.preset
      // Null resets a map; a dictionary changes only the named entries. Null
      // entries reset one image. Ordinary edits must never replace sibling data.
      const next = { ...state.layout, ...clone(layout) } as NativeLayout
      for (const key of ['frames', 'crops', 'imageFits'] as const) {
        if (layout[key] === undefined) continue
        if (layout[key] === null) { next[key] = {} as never; continue }
        const entries = assertRecord(layout[key], key)
        const merged: Record<string, unknown> = { ...state.layout[key] }
        for (const [role, value] of Object.entries(entries)) {
          if (value === null) delete merged[role]
          else merged[role] = clone(value)
        }
        next[key] = merged as never
      }
      if (layout.textFrame === null) delete next.textFrame
      if (layout.gradient === null) delete next.gradient
      state.layout = next
      validateNativeState(state)
      if (layout.preset !== undefined && (previousPreset !== next.preset || next.preset !== 'legacy')) {
        const roles = nativeImageRoles(slide, state)
        const assignments = slide.mediaAssignments ?? []
        const occupied = new Set(assignments.filter((a) => roles.includes(a.role)).map((a) => a.role))
        for (const assignment of assignments.filter((a) => !roles.includes(a.role))) {
          const vacant = roles.find((role) => !occupied.has(role))
          appendOperationPair(forward, inverse,
            { type: 'asset.assignment.remove', payload: { slideId: id, mediaAssignmentId: assignment.id } },
            { type: 'asset.assignment.insert', payload: { slideId: id, assignment: clone(assignment) } })
          if (vacant) {
            occupied.add(vacant)
            appendOperationPair(forward, inverse,
              { type: 'asset.assignment.insert', payload: { slideId: id, assignment: { ...assignment, role: vacant } } },
              { type: 'asset.assignment.remove', payload: { slideId: id, mediaAssignmentId: assignment.id } })
          } else if (!state.shortlist.includes(assignment.assetReferenceId)) state.shortlist.push(assignment.assetReferenceId)
        }
      }
    }
    const mutation = nativeMutation(deck, slide, state, command.source.label ?? 'Adjust prototype')
    if (!forward.length) return mutation
    appendOperationPair(forward, inverse, mutation.forward, mutation.inverse)
    return { forward: operationList(forward), inverse: operationList(inverse), label: mutation.label }
  }
  if (command.type === 'native.nudge') {
    const target = assertIdentity(command.payload.target, 'target', 512)
    const frame = clone((target === 'text' ? state.layout.textFrame : state.layout.frames[target]) ?? assertElementFrame(command.payload.frame))
    frame.x += nativeNumber(command.payload.dx, 'dx', -10000, 10000); frame.y += nativeNumber(command.payload.dy, 'dy', -10000, 10000)
    if (target === 'text') state.layout.textFrame = frame; else state.layout.frames[target] = frame
    return nativeMutation(deck, slide, state, 'Nudge prototype')
  }
  if (command.type !== 'native.curate.set') throw new Error('Unknown native command')
  const asset = assertAssetReferenceSnapshot(command.payload.asset), assetId = asset.id, action = assertString(command.payload.action, 'action', 64)
  const forward: HistoryOperation[] = [], inverse: HistoryOperation[] = []
  if (!(deck.assetReferences ?? []).some((a) => a.id === assetId)) appendOperationPair(forward, inverse, { type: 'asset.reference.insert', payload: { assetReference: asset } }, { type: 'asset.reference.remove', payload: { assetReferenceId: assetId } })
  const candidate = (a: string) => { if (!state.shortlist.includes(a)) state.shortlist.push(a) }
  if (action === 'shortlist') { candidate(assetId); state.rejected = state.rejected.filter((a) => a !== assetId) }
  else if (action === 'remove-shortlist') state.shortlist = state.shortlist.filter((a) => a !== assetId)
  else if (action === 'clear-reject') state.rejected = state.rejected.filter((a) => a !== assetId)
  else if (action === 'reject' || action === 'unassign') {
    if (action === 'unassign') candidate(assetId)
    if (action === 'reject') { if (!state.rejected.includes(assetId)) state.rejected.push(assetId); state.shortlist = state.shortlist.filter((a) => a !== assetId) }
    for (const a of slide.mediaAssignments ?? []) if (a.assetReferenceId === assetId) appendOperationPair(forward, inverse, { type: 'asset.assignment.remove', payload: { slideId: id, mediaAssignmentId: a.id } }, { type: 'asset.assignment.insert', payload: { slideId: id, assignment: clone(a) } })
  } else if (action === 'use') {
    const role = assertIdentity(command.payload.role ?? 'primary', 'role', 512)
    if (!nativeImageRoles(slide, state).includes(role)) throw new Error('Choose a visible image slot for this layout')
    const old = slide.mediaAssignments?.find((a) => a.role === role)
    const other = slide.mediaAssignments?.find((a) => a.assetReferenceId === assetId && a.role !== role)
    if (other) {
      if (old) {
        appendOperationPair(forward, inverse,
          { type: 'asset.assignment.asset.set', payload: { slideId: id, mediaAssignmentId: other.id, assetReferenceId: old.assetReferenceId } },
          { type: 'asset.assignment.asset.set', payload: { slideId: id, mediaAssignmentId: other.id, assetReferenceId: assetId } })
      } else {
        appendOperationPair(forward, inverse,
          { type: 'asset.assignment.remove', payload: { slideId: id, mediaAssignmentId: other.id } },
          { type: 'asset.assignment.insert', payload: { slideId: id, assignment: clone(other) } })
      }
    }
    if (old && old.assetReferenceId !== assetId) {
      candidate(old.assetReferenceId)
      appendOperationPair(forward, inverse, { type: 'asset.assignment.asset.set', payload: { slideId: id, mediaAssignmentId: old.id, assetReferenceId: assetId } }, { type: 'asset.assignment.asset.set', payload: { slideId: id, mediaAssignmentId: old.id, assetReferenceId: old.assetReferenceId } })
    } else if (!old) {
      const assignment = { id: assertIdentity(command.payload.assignmentId, 'assignmentId', 256), role, assetReferenceId: assetId }
      if (mediaAssignmentIdentityExists(deck, assignment.id)) throw new Error('Assignment ID already exists')
      appendOperationPair(forward, inverse, { type: 'asset.assignment.insert', payload: { slideId: id, assignment } }, { type: 'asset.assignment.remove', payload: { slideId: id, mediaAssignmentId: assignment.id } })
    }
    const oldDecision = ownValue(deck.workbenchCurate?.slides, id)?.decisions[assetId]
    if (oldDecision) appendOperationPair(forward, inverse, { type: 'curate.slideDecision.set', payload: { slideId: id, assetReferenceId: assetId, value: null } }, { type: 'curate.slideDecision.set', payload: { slideId: id, assetReferenceId: assetId, value: clone(oldDecision) } })
    candidate(assetId); state.rejected = state.rejected.filter((a) => a !== assetId)
  } else throw new Error('Unsupported curation action')
  if (['use', 'shortlist'].includes(action) && command.payload.fingerprint !== undefined) state.sourceFingerprints[assetId] = assertString(command.payload.fingerprint, 'fingerprint', 500)
  const m = nativeMutation(deck, slide, state, `${action === 'use' ? 'Choose' : action} image`)
  if (!m.noop || forward.length) appendOperationPair(forward, inverse, m.forward, m.inverse)
  return forward.length ? { forward: operationList(forward), inverse: operationList(inverse), label: m.label } : { ...m, noop: true }
}
