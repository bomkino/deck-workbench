import assert from 'node:assert/strict'
import test from 'node:test'

import {
  adjustMediaDensity,
  captureMediaScrollAnchor,
  moveMediaGridFocus,
  planMediaVirtualWindow,
  restoreMediaScrollAnchor,
  scrollTopToRevealMediaItem,
} from '../packages/media-catalog/index.mjs'
import { CURATE_MEDIA_FIXTURE_COUNT } from './fixtures/curate-media-fixture.mjs'

test('10,240 Assets produce a bounded visible-plus-overscan window instead of 10,240 mounted cards', () => {
  const input = {
    itemCount: CURATE_MEDIA_FIXTURE_COUNT,
    viewportWidth: 968,
    viewportHeight: 640,
    scrollTop: 94_500,
    targetCardWidth: 160,
    mediaAspectRatio: 4 / 3,
    labelHeight: 48,
    gap: 12,
    overscanRows: 3,
  }
  const window = planMediaVirtualWindow(input)
  const visibleRows = Math.ceil((input.viewportHeight + input.gap) / window.rowHeight) + 1
  const mountedUpperBound = (visibleRows + 2 * input.overscanRows) * window.columns
  assert.equal(window.rowCount, Math.ceil(CURATE_MEDIA_FIXTURE_COUNT / window.columns))
  assert.equal(window.canvasHeight, window.rowCount * window.rowHeight - input.gap)
  assert.equal(window.items.length, window.endIndex - window.startIndex)
  assert.equal(window.items.length <= mountedUpperBound, true)
  assert.equal(window.items.length < 100, true)
  assert.equal(window.startIndex > 0, true)
  assert.equal(window.endIndex < CURATE_MEDIA_FIXTURE_COUNT, true)
  assert.equal(window.items[0].index, window.startIndex)
  assert.equal(window.items.at(-1).index, window.endIndex - 1)
})

test('virtual geometry clips empty, top and beyond-end windows without phantom indices', () => {
  const empty = planMediaVirtualWindow({
    itemCount: 0,
    viewportWidth: 800,
    viewportHeight: 600,
  })
  assert.equal(empty.startIndex, 0)
  assert.equal(empty.endIndex, 0)
  assert.equal(empty.items.length, 0)
  assert.equal(empty.canvasHeight, 600)

  const top = planMediaVirtualWindow({
    itemCount: 17,
    viewportWidth: 640,
    viewportHeight: 360,
    scrollTop: 0,
    targetCardWidth: 150,
    overscanRows: 2,
  })
  assert.equal(top.startIndex, 0)
  assert.equal(top.items.every((item) => item.index >= 0 && item.index < 17), true)

  const end = planMediaVirtualWindow({
    itemCount: 17,
    viewportWidth: 640,
    viewportHeight: 360,
    scrollTop: Number.MAX_SAFE_INTEGER,
    targetCardWidth: 150,
    overscanRows: 2,
  })
  assert.equal(end.endIndex, 17)
  assert.equal(end.scrollTop, Math.max(0, end.canvasHeight - 360))
  assert.equal(end.items.every((item) => item.index >= 0 && item.index < 17), true)
})

test('an Asset-index anchor retains its viewport offset across density and column reflow', () => {
  const selectedAssetIndex = 5_432
  const initial = planMediaVirtualWindow({
    itemCount: CURATE_MEDIA_FIXTURE_COUNT,
    viewportWidth: 1_080,
    viewportHeight: 680,
    scrollTop: 185_000,
    targetCardWidth: 176,
  })
  const selectedRowTop = Math.floor(selectedAssetIndex / initial.columns) * initial.rowHeight
  const scrollTop = Math.max(0, selectedRowTop - 83)
  const anchor = captureMediaScrollAnchor({
    itemIndex: selectedAssetIndex,
    columns: initial.columns,
    rowHeight: initial.rowHeight,
    scrollTop,
  })

  const reflowGeometry = planMediaVirtualWindow({
    itemCount: CURATE_MEDIA_FIXTURE_COUNT,
    viewportWidth: 1_080,
    viewportHeight: 680,
    scrollTop: 0,
    targetCardWidth: 240,
  })
  assert.notEqual(reflowGeometry.columns, initial.columns)
  const restoredScrollTop = restoreMediaScrollAnchor({
    anchor,
    columns: reflowGeometry.columns,
    rowHeight: reflowGeometry.rowHeight,
  })
  const restored = planMediaVirtualWindow({
    itemCount: CURATE_MEDIA_FIXTURE_COUNT,
    viewportWidth: 1_080,
    viewportHeight: 680,
    scrollTop: restoredScrollTop,
    targetCardWidth: 240,
  })
  const restoredTop = Math.floor(selectedAssetIndex / restored.columns) * restored.rowHeight
  assert.ok(Math.abs((restoredTop - restored.scrollTop) - 83) < 0.000_001)
  assert.equal(selectedAssetIndex >= restored.startIndex && selectedAssetIndex < restored.endIndex, true)
})

test('keyboard geometry navigates stable logical indices and reveals only when focus leaves the viewport', () => {
  assert.equal(moveMediaGridFocus({ currentIndex: 5, key: 'ArrowLeft', itemCount: 17, columns: 5 }), 4)
  assert.equal(moveMediaGridFocus({ currentIndex: 4, key: 'ArrowRight', itemCount: 17, columns: 5 }), 5)
  assert.equal(moveMediaGridFocus({ currentIndex: 7, key: 'ArrowUp', itemCount: 17, columns: 5 }), 2)
  assert.equal(moveMediaGridFocus({ currentIndex: 13, key: 'ArrowDown', itemCount: 17, columns: 5 }), 16)
  assert.equal(moveMediaGridFocus({ currentIndex: 16, key: 'ArrowDown', itemCount: 17, columns: 5 }), 16)
  assert.equal(moveMediaGridFocus({ currentIndex: 9, key: 'Home', itemCount: 17, columns: 5 }), 0)
  assert.equal(moveMediaGridFocus({ currentIndex: 9, key: 'End', itemCount: 17, columns: 5 }), 16)
  assert.equal(moveMediaGridFocus({ currentIndex: 11, key: 'PageUp', itemCount: 17, columns: 5, pageRows: 2 }), 1)
  assert.equal(moveMediaGridFocus({ currentIndex: 11, key: 'PageDown', itemCount: 17, columns: 5, pageRows: 2 }), 16)
  assert.equal(moveMediaGridFocus({ currentIndex: -1, key: 'ArrowRight', itemCount: 17, columns: 5 }), 1)
  assert.equal(moveMediaGridFocus({ currentIndex: 0, key: 'ArrowRight', itemCount: 0, columns: 5 }), -1)

  assert.equal(scrollTopToRevealMediaItem({
    itemIndex: 7,
    columns: 5,
    rowHeight: 120,
    viewportHeight: 360,
    currentScrollTop: 0,
  }), 0)
  assert.equal(scrollTopToRevealMediaItem({
    itemIndex: 20,
    columns: 5,
    rowHeight: 120,
    viewportHeight: 360,
    currentScrollTop: 0,
  }), 240)
  assert.equal(scrollTopToRevealMediaItem({
    itemIndex: 2,
    columns: 5,
    rowHeight: 120,
    viewportHeight: 360,
    currentScrollTop: 240,
  }), 0)

  const initial = planMediaVirtualWindow({
    itemCount: CURATE_MEDIA_FIXTURE_COUNT,
    viewportWidth: 968,
    viewportHeight: 640,
    scrollTop: 155_000,
    targetCardWidth: 160,
  })
  const focusedIndex = initial.startIndex + initial.columns
  const nextFocus = moveMediaGridFocus({
    currentIndex: focusedIndex,
    key: 'PageDown',
    itemCount: CURATE_MEDIA_FIXTURE_COUNT,
    columns: initial.columns,
    pageRows: 8,
  })
  const nextScrollTop = scrollTopToRevealMediaItem({
    itemIndex: nextFocus,
    columns: initial.columns,
    rowHeight: initial.rowHeight,
    viewportHeight: 640,
    currentScrollTop: initial.scrollTop,
  })
  const recycled = planMediaVirtualWindow({
    itemCount: CURATE_MEDIA_FIXTURE_COUNT,
    viewportWidth: 968,
    viewportHeight: 640,
    scrollTop: nextScrollTop,
    targetCardWidth: 160,
  })
  assert.equal(nextFocus >= recycled.startIndex && nextFocus < recycled.endIndex, true)
  assert.equal(recycled.items.length < 100, true)
})

test('thumbnail density keys remain a bounded geometry preference', () => {
  assert.equal(adjustMediaDensity(176, '+'), 160)
  assert.equal(adjustMediaDensity(176, '-'), 192)
  assert.equal(adjustMediaDensity(96, '+'), 96)
  assert.equal(adjustMediaDensity(320, '-'), 320)
  assert.equal(adjustMediaDensity(176, 'x'), 176)
})
