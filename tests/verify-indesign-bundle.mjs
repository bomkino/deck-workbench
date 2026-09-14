// Run with the canonical Deck Production.jsxinc path. This tests its actual
// ES3 validators; native role-layer placement remains a separate InDesign check.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createHash } from 'node:crypto'

const modulePath = process.argv[2]
if (!modulePath) throw new Error('Pass the canonical Deck Production.jsxinc path.')
const entries = new Map()
function Folder(name) { return { fsName: String(name), exists: true, alias: false, get parent() { return Folder(path.dirname(this.fsName)) } } }
function File(name) {
  if (!(this instanceof File)) return new File(name)
  this.fsName = String(name); this.name = path.basename(this.fsName); this.parent = Folder(path.dirname(this.fsName)); this.position = 0
}
File.decode = decodeURIComponent
Object.defineProperties(File.prototype, {
  exists: { get() { return entries.has(this.fsName) } },
  length: { get() { return entries.get(this.fsName)?.length ?? 0 } },
  eof: { get() { return this.position >= this.length } },
  alias: { get() { return false } },
})
File.prototype.open = function () { this.position = 0; return this.exists }
File.prototype.close = function () {}
File.prototype.read = function (length = this.length) {
  const bytes = entries.get(this.fsName).subarray(this.position, this.position + length)
  this.position += bytes.length
  return bytes.toString(this.encoding === 'BINARY' ? 'latin1' : 'utf8')
}
const context = vm.createContext({ File, Folder, $: { fileName: '/module/Deck Production.jsxinc', evalFile() {} }, app: {} })
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context)
const production = context.PitchdogDeckProduction
for (const bytes of [Buffer.alloc(0), Buffer.from('abc'), Buffer.alloc(55, 97), Buffer.alloc(56, 97), Buffer.alloc(64, 97), Buffer.alloc(1_000_000, 97), Buffer.from(Array.from({ length: 65539 }, (_, i) => i % 256))]) {
  entries.set('/hash', bytes)
  assert.equal(production.sha256File(File('/hash')), createHash('sha256').update(bytes).digest('hex'))
}
assert.deepEqual(JSON.parse(JSON.stringify(production.parseJSON('{"a":[true,false,null,1.25e2,"\\u20b9\\n"]}'))), { a: [true, false, null, 125, '₹\n'] })
for (const json of ['{"__proto__":{}}', '{"a":1,"a":2}', '[1,]', '{"x":01}', '{} trailing']) assert.throws(() => production.parseJSON(json))

const fields = ['headline', 'subheadline', 'body'].map(role => ({ role, state: 'present', text: role, sourceBlockIDs: [role] }))
const parsed = { title: 'Deck', canvas: 'widescreen-1920x1080', slides: [1, 2].map(() => ({ title: 'Duplicate', ...Object.fromEntries(fields.map(f => [f.role, { state: f.state, text: f.text }])) })) }
const markdown = Buffer.from('exact source bytes\n')
entries.set('/bundle/workbench.md', markdown)
const manifest = { format: 'pitchdog-workbench-production/1', deckID: 'deck', revision: 3, title: 'Deck', canvas: { id: parsed.canvas, width: 1920, height: 1080 }, copyFile: 'workbench.md', copySHA256: createHash('sha256').update(markdown).digest('hex'), slides: [1, 2].map(i => ({ slideID: `s${i}`, sectionID: 'part', sourceOrdinal: i + 2, exportOrdinal: i, title: 'Duplicate', projection: fields, psd: null })) }
const validate = value => {
  entries.set('/bundle/workbench-production.json', Buffer.from(JSON.stringify(value)))
  return production.productionBundle(File('/bundle/workbench.md'), parsed, { width: 1920, height: 1080 }, {})
}
assert.equal(validate(manifest).files, null)
assert.throws(() => validate({ ...manifest, copySHA256: '0'.repeat(64) }), /changed after export/)
assert.throws(() => validate({ ...manifest, slides: [manifest.slides[0], manifest.slides[0]] }), /identities or ordinals/)
const psd = Buffer.alloc(26); psd.write('8BPS'); psd.writeUInt16BE(1, 4); psd.writeUInt32BE(1080, 14); psd.writeUInt32BE(1920, 18); psd.writeUInt16BE(8, 22); psd.writeUInt16BE(3, 24)
entries.set('/bundle/PSD/Slide 01.psd', psd)
const artwork = { path: 'PSD/Slide 01.psd', sha256: createHash('sha256').update(psd).digest('hex'), width: 1920, height: 1080, depth: 8, colorMode: 'RGB' }
assert.throws(() => validate({ ...manifest, slides: [{ ...manifest.slides[0], psd: artwork }, manifest.slides[1]] }), /cover every slide/)
assert.throws(() => validate({ ...manifest, slides: [{ ...manifest.slides[0], psd: { ...artwork, path: '../Slide.psd' } }, manifest.slides[1]] }), /stay inside/)
assert.throws(() => validate({ ...manifest, slides: [{ ...manifest.slides[0], psd: { ...artwork, width: 2576 } }, manifest.slides[1]] }), /Invalid PSD/)
const own = value => production.parseJSON(JSON.stringify(value))
const tocRows = [
  { slideID: 'cover', title: 'Cover', intent: 'full-bleed' },
  { slideID: 'toc', title: 'Contents', intent: 'contents', appearance: 'light' },
  { slideID: 'cast', title: 'Cast — Zoë and the bear 🐻', intent: 'full-bleed' },
  { slideID: 'toc-again', title: 'Contents again', intent: 'contents' },
]
const tocBody = 'Cover\t01\nCast — Zoë and the bear 🐻\t03'
const tocBlocks = [
  { blockID: 'head', role: 'headline', text: 'Contents' },
  { blockID: 'note', role: 'caption', text: 'A note above.' },
  { blockID: 'toc:contents', role: 'body', text: tocBody },
  { blockID: 'credit', role: 'credit', text: 'A credit.\nA forced line.' },
]
tocRows[1].blocks = tocBlocks
tocRows[1].projection = [
  { role: 'headline', state: 'present', text: 'Contents' },
  { role: 'subheadline', state: 'intentionally-blank', text: '' },
  { role: 'body', state: 'present', text: `A note above.\n\n${tocBody}\n\nA credit.\nA forced line.` },
]
const planned = production.contentsPlan(own(tocRows[1]), own(tocRows))
assert.equal(planned.text, `Contents\rA note above.\rCover\t01\rCast — Zoë and the bear 🐻\t03\rA credit.\nA forced line.`)
assert.deepEqual(Array.from(planned.paragraphs, p => p.kind), ['title', 'body', 'entry', 'entry', 'body'])
assert.deepEqual(Array.from(planned.paragraphs).filter(p => p.kind === 'entry').map(p => p.number), ['01', '03'])
assert.throws(() => production.contentsPlan(own(tocRows[1]), own([tocRows[2], tocRows[1], tocRows[0], tocRows[3]])), /frozen slide order/)
assert.throws(() => production.contentsPlan(own({ ...tocRows[1], blocks: tocBlocks.map(b => b.blockID === 'credit' ? { ...b, text: 'Changed' } : b) }), own(tocRows)), /do not match/)
const emptyTOC = { slideID: 'only-toc', title: 'Contents', intent: 'contents', blocks: [{ blockID: 'only-toc:contents', role: 'body', text: '' }], projection: [{ role: 'headline', state: 'present', text: 'Contents' }, { role: 'subheadline', state: 'intentionally-blank', text: '' }, { role: 'body', state: 'intentionally-blank', text: '' }] }
assert.equal(production.contentsPlan(own(emptyTOC), own([emptyTOC])).text, 'Contents')

const styleNames = ['Project | Head', 'Project | Sub', 'Project | Body', 'Head - Light', 'Sub - Light', 'Body - Light', 'TOC - Title', 'TOC - Entry', 'TOC - Title (light)', 'TOC - Entry (light)']
const styleDoc = {
  allParagraphStyles: styleNames.map((name, id) => ({ name, id, isValid: true })),
  allCharacterStyles: [{ name: 'TOC - Page number', id: 40, isValid: true }],
  allObjectStyles: [{ name: 'Contents - Two columns', id: 41, isValid: true, textFramePreferences: { textColumnCount: 2, verticalBalanceColumns: true } }],
  masterSpreads: { itemByName: name => ({ name, isValid: ['D-Dark', 'L-Light'].includes(name) }) },
  pages: [{ appliedMaster: { name: 'L-Light' } }],
}
assert.equal(production.preflightFormatting(own({ slides: [{ appearance: 'dark' }, { appearance: 'light' }] }), styleDoc)[1].styles.master.name, 'L-Light')
assert.equal(production.preflightFormatting(own({ slides: [{}] }), {})[0], null)
assert.throws(() => production.preflightFormatting(own({ slides: [{ appearance: 'yellow' }] }), styleDoc), /Unknown slide appearance/)
const legacyTOCPlan = production.preflightFormatting(own({ slides: [emptyTOC] }), styleDoc)[0]
assert.equal(legacyTOCPlan.styles.contents.title.name, 'TOC - Title (light)')
assert.equal(legacyTOCPlan.setAppearance, false)
assert.throws(() => production.preflightFormatting(own({ slides: [emptyTOC] }), { ...styleDoc, allObjectStyles: [] }), /missing Contents/)
console.log('PASS: actual ES3 hashes, bundle binding, PSD guards, frozen Contents order/copy, mixed appearances and required native styles. Native placement/rendering not exercised.')
