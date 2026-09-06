import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
const c = vm.createContext({ console }); vm.runInContext(fs.readFileSync(new URL('../build/generated/deck-kernel.js', import.meta.url), 'utf8'), c)
const k=c.DeckKernel, plain=x=>JSON.parse(JSON.stringify(x))
const text=s=>({type:'doc',content:s.split('\n').map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[]}))})
const session=()=>k.open(k.createInitialCheckpoint({deckId:'deck',sectionId:'part',slideId:'slide',blockId:'headline',title:'Writer handoff',initialHeadline:'Exact words.'}))
function send(s,type,payload) { const p=k.prepare(s,{commandId:crypto.randomUUID(),expectedRevision:s.checkpoint.revision,type,payload,source:{kind:'keyboard'},issuedAt:'2026-09-05T10:00:00Z'});assert.equal(p.ok,true,p.error?.message);if(!p.duplicate)assert.notEqual(k.commit(s,p).ok,false);return p }
const asset=id=>({id,label:`${id}.jpg`,mediaKind:'image',availability:'available'})
const curate=(s,id,action)=>send(s,'native.curate.set',{slideId:'slide',asset:asset(id),action,assignmentId:`assignment-${id}`,fingerprint:`sha-${id}`})
const slide=s=>k.query(s,'native.document').deck.sections[0].slides[0]
function history(s,redo=false){const p=redo?k.prepareRedo(s):k.prepareUndo(s);assert.equal(p.ok,true,p.error?.message);assert.notEqual(k.commit(s,p).ok,false)}
test('chosen/shortlist independence, idempotence, replacement and one-step undo',()=>{const s=session();curate(s,'a','use');const rev=s.checkpoint.revision;assert.equal(curate(s,'a','shortlist').duplicate,true);assert.equal(s.checkpoint.revision,rev);curate(s,'a','remove-shortlist');assert.equal(slide(s).mediaAssignments[0].assetReferenceId,'a');curate(s,'b','use');assert.deepEqual(plain(slide(s).native.shortlist),['a','b']);history(s);assert.equal(slide(s).mediaAssignments[0].assetReferenceId,'a');assert.deepEqual(plain(slide(s).native.shortlist),[]);history(s,true);curate(s,'b','reject');assert.equal(slide(s).mediaAssignments.length,0);history(s);assert.equal(slide(s).mediaAssignments[0].assetReferenceId,'b')})
test('forty decisions survive serialization and journal replay',()=>{const s=session(),records=[];for(let i=0;i<40;i++){const p=curate(s,`a${i}`,'shortlist');records.push({...plain(p.journalOperation),revision:p.nextRevision})}const reopened=k.open(plain(k.serializeSession(s)));assert.equal(reopened.ok,undefined,reopened.error?.message);assert.deepEqual(plain(slide(reopened).native),plain(slide(s).native));const replay=session();for(const r of records){const result=k.replayRecord(replay,r);assert.notEqual(result.ok,false,result.error?.message)}assert.equal(slide(replay).native.shortlist.length,40)})
test('repeated roles and Unicode copy remain complete and reversible',()=>{const s=session();const blocks=[{id:'headline',semanticKey:'headline',role:'headline',value:text('Exact words.')},{id:'body1',semanticKey:'one.bio',role:'body',value:text('One.\n\nTwo — ₹1,000.')},{id:'body2',semanticKey:'two.bio',role:'body',value:text('Second body.')},{id:'credit',semanticKey:'credit',role:'credit',value:text('Photo: original photographer')}];send(s,'native.copy.replace',{slides:[{slideId:'slide',blocks}]});assert.deepEqual(plain(slide(s).contentBlocks),blocks);history(s);assert.equal(slide(s).contentBlocks.length,1);history(s,true);assert.equal(slide(s).contentBlocks.length,4)})
test('empty notes allowed; invalid geometry is an atomic rejection',()=>{const s=session();send(s,'native.slide.patch',{slideId:'slide',patch:{notes:'Direction'}});send(s,'native.slide.patch',{slideId:'slide',patch:{notes:''}});const before=JSON.stringify(k.serializeSession(s));const p=k.prepare(s,{commandId:'bad',expectedRevision:s.checkpoint.revision,type:'native.slide.patch',payload:{slideId:'slide',patch:{layout:{columns:0}}},source:{kind:'ui'},issuedAt:'2026-09-05T10:00:00Z'});assert.equal(p.ok,false);assert.equal(JSON.stringify(k.serializeSession(s)),before)})
test('relative nudges accumulate without waiting for a rendered revision',()=>{const s=session();for(let i=0;i<5;i++)send(s,'native.nudge',{slideId:'slide',target:'text',frame:{x:96,y:64,width:1184,height:952},dx:1,dy:0});assert.equal(slide(s).native.layout.textFrame.x,101)})

test('real layout-picker resets are valid and do not fence later decisions', () => {
  const s=session()
  for(const preset of ['left','right','lower']) send(s,'native.slide.patch',{slideId:'slide',patch:{layout:{preset,textFrame:null,frames:null}}})
  curate(s,'after-layout','shortlist')
  assert.equal(slide(s).native.layout.preset,'lower')
  assert(slide(s).native.shortlist.includes('after-layout'))
})
test('per-role crop, fit and frame edits retain siblings through undo and reopen', () => {
  const s=session()
  const a={x:0.1,y:0.2,width:0.7,height:0.6}, b={x:0.2,y:0.1,width:0.6,height:0.7}
  const f={x:100,y:80,width:500,height:600}, g={x:800,y:80,width:500,height:600}
  const patch=layout=>send(s,'native.slide.patch',{slideId:'slide',patch:{layout}})
  patch({crops:{primary:a},frames:{primary:f},imageFits:{primary:'fit'}})
  patch({crops:{'primary:2':b},frames:{'primary:2':g},imageFits:{'primary:2':'fill'}})
  const settings=plain(slide(s).native)
  assert.deepEqual(settings.layout.crops,{primary:a,'primary:2':b})
  assert.deepEqual(settings.layout.frames,{primary:f,'primary:2':g})
  assert.deepEqual(settings.layout.imageFits,{primary:'fit','primary:2':'fill'})
  history(s); assert.deepEqual(plain(slide(s).native.layout.frames),{primary:f})
  history(s,true)
  assert.deepEqual(plain(slide(k.open(plain(k.serializeSession(s))))).native,settings)
  patch({crops:{primary:null}})
  assert.deepEqual(plain(slide(s).native.layout.crops),{'primary:2':b})
})
test('three-image to single-image reconciles assignments in one reversible command', () => {
  const s=session()
  send(s,'native.slide.patch',{slideId:'slide',patch:{layout:{preset:'three-images'}}})
  for(let i=0;i<3;i++) send(s,'native.curate.set',{slideId:'slide',asset:asset(`p${i}`),action:'use',role:i?`primary:${i+1}`:'primary',assignmentId:`slot${i}`})
  send(s,'native.slide.patch',{slideId:'slide',patch:{layout:{preset:'left',frames:null,textFrame:null}}})
  assert.equal(slide(s).mediaAssignments.length,1)
  assert.deepEqual(plain(slide(s).native.shortlist),['p0','p1','p2'])
  history(s); assert.equal(slide(s).mediaAssignments.length,3)
  send(s,'native.curate.set',{slideId:'slide',asset:asset('p1'),action:'use',role:'primary',assignmentId:'unused'})
  assert.equal(slide(s).mediaAssignments.find(a=>a.role==='primary').assetReferenceId,'p1')
  assert.equal(slide(s).mediaAssignments.find(a=>a.role==='primary:2').assetReferenceId,'p0')
  history(s); assert.equal(slide(s).mediaAssignments.find(a=>a.role==='primary').assetReferenceId,'p0')
})

 test('reapplying a batch arrangement is a safe no-op, not an empty-history error', () => {
  const s=session(), payload={slideIds:['slide'],layout:{preset:'right',frames:null,textFrame:null,columns:2}}
  send(s,'native.layout.apply',payload)
  const revision=s.checkpoint.revision
  assert.equal(send(s,'native.layout.apply',payload).duplicate,true)
  assert.equal(s.checkpoint.revision,revision)
  curate(s,'still-writable','shortlist')
  assert(slide(s).native.shortlist.includes('still-writable'))
})

test('native add, duplicate, rename, move and delete preserve independent work through undo and reopen', () => {
  const s=session()
  curate(s,'photo','use')
  send(s,'native.slide.patch',{slideId:'slide',patch:{notes:'Writer direction',layout:{preset:'right',columns:2,crops:{primary:{x:.1,y:0,width:.8,height:1}}}}})
  const original=plain(slide(s))
  send(s,'native.slide.add',{slideId:'new-slide',sectionId:'part',afterSlideId:'slide',title:'New slide'})
  let all=k.query(s,'native.document').deck.sections[0].slides
  assert.equal(all.length,2)
  assert.deepEqual(plain(all[1].contentBlocks.map(b=>b.role)),['headline','subheadline','body'])
  assert.equal(all[1].native.layout.bodySize,32)
  send(s,'native.slide.duplicate',{slideId:'duplicate',sectionId:'part',afterSlideId:'slide',sourceSlideId:'slide',title:'Copy'})
  all=k.query(s,'native.document').deck.sections[0].slides
  const copied=plain(all[1])
  assert.deepEqual(copied.native,original.native)
  assert.equal(copied.mediaAssignments[0].assetReferenceId,'photo')
  assert.notEqual(copied.mediaAssignments[0].id,original.mediaAssignments[0].id)
  assert.notEqual(copied.contentBlocks[0].id,original.contentBlocks[0].id)
  const changed=structuredClone(copied.contentBlocks); changed[0].value=text('The new copy — with ₹ and paragraphs.\n\nNo source changes.')
  send(s,'native.copy.replace',{slides:[{slideId:'duplicate',title:'Revised copy',blocks:changed,expectedBlocks:copied.contentBlocks}]})
  assert.equal(k.query(s,'native.document').deck.sections[0].slides[1].internalTitle,'Revised copy')
  assert.deepEqual(plain(slide(s)),original)
  history(s)
  assert.deepEqual(plain(k.query(s,'native.document').deck.sections[0].slides[1]),copied)
  history(s,true)
  send(s,'slide.move',{slideId:'duplicate',targetSectionId:'part',afterSlideId:'new-slide'})
  const beforeDelete=plain(k.query(s,'native.document').deck)
  send(s,'slide.remove',{slideId:'duplicate'})
  assert.equal(k.query(s,'native.document').deck.sections[0].slides.length,2)
  assert.equal(k.query(s,'native.document').deck.assetReferences.length,1)
  history(s)
  assert.deepEqual(plain(k.query(s,'native.document').deck),beforeDelete)
  const reopened=k.open(plain(k.serializeSession(s)))
  assert.deepEqual(plain(k.query(reopened,'native.document').deck),beforeDelete)
  history(reopened,true)
  assert.equal(k.query(reopened,'native.document').deck.sections[0].slides.length,2)
})

test('duplication remaps legacy composition bindings and retains source identity and history', () => {
  const s=session()
  send(s,'asset.reference.add',{assetReferenceId:'image',label:'image.jpg',mediaKind:'image'})
  send(s,'asset.assign',{slideId:'slide',mediaAssignmentId:'image-assignment',role:'primary',assetReferenceId:'image'})
  send(s,'designOption.createFromPlan',{slideId:'slide',designOptionId:'old-option'})
  const source=k.query(s,'native.document').deck.sections[0].slides[0]
  const element=source.designOptions[0].composition.elements.find(e=>e.kind==='text')
  send(s,'element.frame.update',{slideId:'slide',designOptionId:'old-option',elementId:element.id,frame:{x:96,y:64,width:1184,height:900}})
  send(s,'native.slide.duplicate',{slideId:'dup',sectionId:'part',afterSlideId:'slide',sourceSlideId:'slide',title:'Legacy copy'})
  const copy=k.query(s,'native.document').deck.sections[0].slides[1]
  assert.equal(copy.native.layout.preset,'legacy')
  assert.notEqual(copy.activeDesignOptionId,source.activeDesignOptionId)
  assert.equal(copy.designOptions[0].composition.elements.find(e=>e.kind==='text').contentBlockId,copy.contentBlocks[0].id)
  assert.equal(copy.designOptions[0].planSnapshot.contentBlockIds.headline,copy.contentBlocks[0].id)
  assert.notEqual(copy.designOptions[0].composition.elements[0].id,source.designOptions[0].composition.elements[0].id)
  const reopened=k.open(plain(k.serializeSession(s)))
  assert.notEqual(reopened.ok,false,reopened.error?.message)
})

test('stale copy edits reject atomically; unchanged edits do not add history', () => {
  const s=session(), old=plain(slide(s).contentBlocks)
  const changed=structuredClone(old);changed[0].value=text('Newer words')
  send(s,'native.copy.replace',{slides:[{slideId:'slide',blocks:changed,expectedBlocks:old}]})
  const before=JSON.stringify(k.serializeSession(s))
  const p=k.prepare(s,{commandId:'stale-editor',expectedRevision:s.checkpoint.revision,type:'native.copy.replace',payload:{slides:[{slideId:'slide',blocks:old,expectedBlocks:old}]},source:{kind:'ui'},issuedAt:'2026-09-06T08:00:00Z'})
  assert.equal(p.ok,false)
  assert.match(p.error.message,/changed while the editor was open/)
  assert.equal(JSON.stringify(k.serializeSession(s)),before)
  const revision=s.checkpoint.revision
  assert.equal(send(s,'native.copy.replace',{slides:[{slideId:'slide',blocks:changed,expectedBlocks:changed}]}).duplicate,true)
  assert.equal(s.checkpoint.revision,revision)
})
