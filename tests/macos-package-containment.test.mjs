import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [store, tracer] = await Promise.all([
  readFile(new URL('../apps/macos/Sources/PitchDeckDocumentStore.swift', import.meta.url), 'utf8'),
  readFile(new URL('../apps/macos/Sources/PackagedTracer.swift', import.meta.url), 'utf8'),
])

test('macOS package I/O is descriptor-relative and rejects linked or non-regular entries', () => {
  assert.match(store, /Darwin\.open\(packageURL\.path, O_RDONLY \| O_DIRECTORY \| O_NOFOLLOW\)/)
  assert.match(store, /Darwin\.openat\(parentDescriptor, name, O_RDONLY \| O_NOFOLLOW\)/)
  assert.match(store, /Darwin\.openat\(parentDescriptor, name, O_WRONLY \| O_APPEND \| O_NOFOLLOW\)/)
  assert.match(store, /\(metadata\.st_mode & S_IFMT\) == S_IFREG/)
  assert.match(store, /O_WRONLY \| O_CREAT \| O_EXCL \| O_NOFOLLOW/)
  assert.match(store, /Darwin\.renameat\(parentDescriptor, temporary, parentDescriptor, name\)/)
  assert.doesNotMatch(store, /Data\(contentsOf: checkpointURL\)/)
  assert.doesNotMatch(store, /FileHandle\(forWritingTo: journalURL\)/)
})

test('packaged negative journey proves linked read, append, and replacement do not touch targets', () => {
  assert.match(tracer, /Linked-Read\.pitchdeck/)
  assert.match(tracer, /Linked-Append\.pitchdeck/)
  assert.match(tracer, /Linked-Write\.pitchdeck/)
  assert.match(tracer, /linkedReadName == "MissingAttachment"/)
  assert.match(tracer, /linkedAppendName == "CheckpointWriteFailure"/)
  assert.match(tracer, /linkedWriteName == "CheckpointWriteFailure"/)
  assert.equal(tracer.match(/Data\(contentsOf: \w+Sentinel\) == sentinel/g)?.length, 3)
})
