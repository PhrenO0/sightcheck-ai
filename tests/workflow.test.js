import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Repository} from '../server/repository.mjs';
import {calculateSeat} from '../src/conversion.js';
import {createApiHandler} from '../server/api.mjs';
import {DEFAULT_MODEL,toVenueModel,getSeats,getTargets,analyzeSightline,validateModel} from '../src/model.js';
async function fixture(){const dir=await mkdtemp(path.join(os.tmpdir(),'sightcheck-test-'));const repository=new Repository(dir);const {project}=await repository.createProject({name:'검증용 가상 홀'});const {event}=await repository.createEvent(project.id,{name:'가상 공연'});return {dir,repository,project,event};}
const demoInput=e=>({expectedRevision:e.revision,mode:'demo',seatLabels:['C3','D3'],rightsConfirmed:true,reviewer:'테스트 담당',allowedOrigins:[]});

test('storage survives a new repository instance; cloned events are independent',async()=>{
  const {dir,repository,project,event}=await fixture();
  const {event:copy}=await repository.createEvent(project.id,{name:'복제 공연',cloneEventId:event.id});
  const changed=structuredClone(copy.model);changed.obstacles[0].size[1]=.4;
  await repository.updateEvent(copy.id,{expectedRevision:copy.revision,model:changed});
  const fresh=new Repository(dir);const loaded=(await fresh.getProject(project.id)).project;
  assert.equal(loaded.events.length,2);assert.equal(loaded.events[0].model.obstacles[0].size[1],1);assert.equal(loaded.events[1].model.obstacles[0].size[1],.4);
});
test('simultaneous edits reject stale revisions without losing the accepted edit',async()=>{
  const {repository,event}=await fixture();
  const responses=await Promise.allSettled([repository.updateEvent(event.id,{expectedRevision:1,name:'첫 수정'}),repository.updateEvent(event.id,{expectedRevision:1,name:'두 번째 수정'})]);
  assert.equal(responses.filter(r=>r.status==='fulfilled').length,1);assert.equal(responses.find(r=>r.status==='rejected').reason.status,409);
});
test('publication only exposes selected seats and approved data; edit and stop revoke old links',async()=>{
  const {repository,project,event}=await fixture();
  const saved=(await repository.updateEvent(event.id,{expectedRevision:1,sessionLabel:'10월 2일 19시'})).event;
  const {publication}=await repository.publish(event.id,demoInput(saved));
  const data=(await repository.publication(publication.slug)).publication;
  assert.deepEqual(data.model.seats.map(s=>s.label),['C3','D3']);assert.equal(data.reviewer,undefined);assert.equal(data.stats,undefined);
  const loaded=(await repository.getProject(project.id)).project.events[0],model=structuredClone(loaded.model);model.obstacles[0].size[1]=.5;
  const edited=(await repository.updateEvent(event.id,{expectedRevision:loaded.revision,model})).event;
  await assert.rejects(repository.publication(publication.slug),e=>e.status===410);
  const next=await repository.publish(event.id,demoInput(edited));
  await repository.unpublish(event.id,{expectedRevision:next.event.revision});
  await assert.rejects(repository.publication(next.publication.slug),e=>e.status===410);
});
test('reviewed publish requires photo, current geometry, matching review and camera height',async()=>{
  const {repository,project,event}=await fixture();let current=(await repository.updateEvent(event.id,{expectedRevision:1,sessionLabel:'사진 검증용 회차'})).event;
  const reviewed=()=>({...demoInput(current),mode:'reviewed',seatLabels:['C3']});
  await assert.rejects(repository.publish(event.id,reviewed()),/C3/);
  const photo=await readFile(new URL('../public/engine-plan.png',import.meta.url));
  let added=await repository.addEvidence(event.id,{expectedRevision:current.revision,seatLabel:'C3',photoDataUrl:`data:image/png;base64,${photo.toString('base64')}`,capturedAt:'2026-10-01',eyeHeightM:1.2,lens:'가상 입력 사진 · 테스트',note:'테스트용 합성 도면이며 실제 현장 사진은 아님',sharePhoto:false});current=added.event;
  await assert.rejects(repository.publish(event.id,reviewed()),/C3/);
  current=(await repository.addReview(event.id,{expectedRevision:current.revision,evidenceId:added.evidence.id,status:'matched',note:'검수 흐름 검증용 합성 이미지'})).event;
  const p=await repository.publish(event.id,reviewed());assert.equal((await repository.publication(p.publication.slug)).publication.evidence[0].assetId,null);
  const changed=structuredClone(p.event.model);changed.seats[12].floor+=.1;
  current=(await repository.updateEvent(event.id,{expectedRevision:p.event.revision,model:changed})).event;
  await assert.rejects(repository.publish(event.id,reviewed()),/현재 배치/);
  await assert.rejects(repository.addReview(event.id,{expectedRevision:current.revision,evidenceId:added.evidence.id,status:'matched',note:'이전 사진 재사용 시도'}),e=>e.status===409);
  const copy=(await repository.createEvent(project.id,{name:'다른 회차',cloneEventId:event.id})).event;assert.equal(copy.evidence.length,0);assert.equal(copy.reviews.length,0);
});
test('last mismatch review blocks publication; image assets remain private until explicitly shared',async()=>{
  const {repository,event}=await fixture();let current=(await repository.updateEvent(event.id,{expectedRevision:1,sessionLabel:'공개 검증 회차'})).event;
  const photo=await readFile(new URL('../public/engine-plan.png',import.meta.url));const added=await repository.addEvidence(event.id,{expectedRevision:current.revision,seatLabel:'C3',photoDataUrl:`data:image/png;base64,${photo.toString('base64')}`,capturedAt:'2026-10-01',eyeHeightM:1.2,lens:'검증용',note:'가상 도면 테스트 사진',sharePhoto:true});current=added.event;
  current=(await repository.addReview(event.id,{expectedRevision:current.revision,evidenceId:added.evidence.id,status:'matched',note:'가상 테스트 일치 기록'})).event;
  current=(await repository.addReview(event.id,{expectedRevision:current.revision,evidenceId:added.evidence.id,status:'mismatch',note:'최신 결과가 불일치하므로 공개 금지'})).event;
  await assert.rejects(repository.publish(event.id,{...demoInput(current),mode:'reviewed',seatLabels:['C3']}),/대조 기록/);
  await assert.rejects(repository.addEvidence(event.id,{expectedRevision:current.revision,seatLabel:'C3',photoDataUrl:'data:image/png;base64,YWJj',capturedAt:'2026-10-01',eyeHeightM:1.2,lens:'테스트',note:'잘못된 이미지'}),/형식/);
});
test('metric totals persist and never imply purchase conversion',async()=>{
  const {repository,event}=await fixture();const saved=(await repository.updateEvent(event.id,{expectedRevision:1,sessionLabel:'가상 회차'})).event;
  const p=await repository.publish(event.id,demoInput(saved));await repository.metric(p.publication.slug,{kind:'view'});await repository.metric(p.publication.slug,{kind:'compare'});
  assert.deepEqual((await repository.eventStats(event.id)).stats,{view:1,compare:1,ticket_out:0});await assert.rejects(repository.metric(p.publication.slug,{kind:'purchase'}));
});

test('reviews apply only to their target and a new mismatch revokes an existing publication',async()=>{
  const {repository,event}=await fixture();const model=structuredClone(event.model);
  model.targets.push({id:'board',name:'전광판',position:[0,10,0],size:[5,3],rotation:[0,0,0]});
  let current=(await repository.updateEvent(event.id,{expectedRevision:1,model,sessionLabel:'대상별 검수 테스트'})).event;
  const photo=await readFile(new URL('../public/engine-plan.png',import.meta.url));
  const input=()=>({expectedRevision:current.revision,seatLabel:'C3',photoDataUrl:`data:image/png;base64,${photo.toString('base64')}`,capturedAt:'2026-10-01',eyeHeightM:1.2,lens:'테스트 합성 이미지',note:'현장 정확도 검증 아님',sharePhoto:false});
  const wrong=await repository.addEvidence(event.id,{...input(),targetId:'board'});current=wrong.event;
  current=(await repository.addReview(event.id,{expectedRevision:current.revision,evidenceId:wrong.evidence.id,status:'matched',note:'전광판 대조 테스트'})).event;
  const publish=()=>({...demoInput(current),mode:'reviewed',seatLabels:['C3']});
  await assert.rejects(repository.publish(event.id,publish()),/대조 기록/);
  const correct=await repository.addEvidence(event.id,input());current=correct.event;
  current=(await repository.addReview(event.id,{expectedRevision:current.revision,evidenceId:correct.evidence.id,status:'matched',note:'무대 대조 테스트'})).event;
  const published=await repository.publish(event.id,publish());current=published.event;
  assert.deepEqual((await repository.publication(published.publication.slug)).publication.model.targets.map(t=>t.id),[model.activeTargetId]);
  current=(await repository.addReview(event.id,{expectedRevision:current.revision,evidenceId:correct.evidence.id,status:'mismatch',note:'게시 이후 발견한 오차 테스트'})).event;
  await assert.rejects(repository.publication(published.publication.slug),e=>e.status===410);
  await repository.updateEvent(event.id,{expectedRevision:current.revision,name:'이름만 변경'});
  await assert.rejects(repository.publication(published.publication.slug),e=>e.status===410);
  assert.equal(calculateSeat({model,seatLabel:'C3',targetId:'board'}).targetId,'board');
  assert.throws(()=>calculateSeat({model,seatLabel:'C3',targetId:'unknown'}),/관람 대상/);
});
test('screen and horizontal field targets preserve metric coordinates; rotated obstacles affect correct rays',()=>{
  const model=toVenueModel(DEFAULT_MODEL);model.targets=[{id:'field',name:'수평 그라운드',position:[0,.05,0],size:[100,60],rotation:[-90,0,0]}];model.activeTargetId='field';model.venueType='stadium';
  const valid=validateModel(model),points=getTargets(valid);assert.ok(points.every(p=>Math.abs(p.y-.05)<1e-12));assert.equal(Math.max(...points.map(p=>p.x)),50);assert.ok(Math.abs(Math.max(...points.map(p=>p.z))-30)<1e-12);
  const near=toVenueModel(DEFAULT_MODEL);near.seats=[{label:'다층 A구역 1열 1번',x:0,z:10,floor:0,row:0,section:'A구역',yaw:0}];near.targets=[{id:'screen',name:'스크린',position:[0,1.2,0],size:[1,1],rotation:[0,0,0]}];near.activeTargetId='screen';near.venueType='cinema';near.obstacles=[{id:'post',name:'회전 구조물',position:[1,1.2,5],size:[.2,3,4],rotation:[0,0,0],layout:'all'}];
  assert.equal(analyzeSightline(near,getSeats(near)[0]).visible,100);near.obstacles[0].rotation=[0,45,0];assert.ok(analyzeSightline(near,getSeats(near)[0]).visible<100);
});
test('HTTP operator authentication, cookie attributes, origin guard, public reads and asset protection',async()=>{
  const {repository,event}=await fixture(),token='test-only-key-with-more-than-24-characters';
  const api=createApiHandler({repository,adminToken:token});const server=http.createServer((req,res)=>api(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/v1/projects`)).status,401);
    const login=await fetch(`${base}/api/v1/auth`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie');assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Strict'));
    assert.equal((await fetch(`${base}/api/v1/projects`,{headers:{Cookie:cookie.split(';')[0]}})).status,200);
    const options={method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,Origin:base},body:JSON.stringify({expectedRevision:1,sessionLabel:'HTTP 검증 회차'})};
    assert.equal((await fetch(`${base}/api/v1/events/${event.id}`,{...options,headers:{...options.headers,Origin:'https://evil.example'}})).status,403);
    const saved=(await (await fetch(`${base}/api/v1/events/${event.id}`,options)).json()).event;
    const p=await repository.publish(event.id,demoInput(saved));assert.equal((await fetch(`${base}/api/v1/publications/${p.publication.slug}`)).status,200);
    assert.equal((await fetch(`${base}/api/v1/assets/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)).status,401);
  }finally{await new Promise(r=>server.close(r));}
});
