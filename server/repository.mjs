import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {DEFAULT_MODEL,toVenueModel,validateModel} from '../src/model.js';

export class ServiceError extends Error {
  constructor(message,status=422,code='INVALID_INPUT') {super(message);this.status=status;this.code=code;}
}
const fail = (message,status,code) => {throw new ServiceError(message,status,code);};
const text = (value,name,max=100) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${name}을(를) 1~${max}자로 입력하세요.`);
  return value.trim();
};
const now = () => new Date().toISOString();
export function geometryHash(model) {
  const {seats,targets,activeTargetId,obstacles,venueType}=toVenueModel(model);
  return createHash('sha256').update(JSON.stringify({seats,targets,activeTargetId,obstacles,venueType})).digest('hex');
}
const checkRevision = (event,revision) => {
  if (!Number.isSafeInteger(revision) || revision !== event.revision) fail('다른 변경이 먼저 저장됐습니다. 최신 공연을 불러온 뒤 수정하세요.',409,'REVISION_CONFLICT');
};
function origins(values=[]) {
  if (!Array.isArray(values) || values.length > 12) fail('삽입 허용 사이트는 12개 이하로 입력하세요.');
  return [...new Set(values.map(value => {
    let url;try {url=new URL(value);} catch {fail('삽입 허용 사이트의 주소를 확인하세요.');}
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || value !== url.origin) fail('삽입 허용 사이트에는 경로 없이 HTTP(S) origin을 입력하세요.');
    return url.origin;
  }))];
}

export class Repository {
  constructor(directory) {this.directory=path.resolve(directory);this.queue=Promise.resolve();}
  async load() {
    await mkdir(path.join(this.directory,'assets'),{recursive:true});
    try {
      const state=JSON.parse(await readFile(path.join(this.directory,'state.json'),'utf8'));
      if (state.schemaVersion!==1 || !Array.isArray(state.projects) || !Array.isArray(state.publications)) throw new Error('저장소 형식이 올바르지 않습니다.');
      return state;
    } catch(error) {
      if (error.code==='ENOENT') return {schemaVersion:1,projects:[],publications:[],assets:[]};
      throw error;
    }
  }
  async transact(action) {
    const job=this.queue.then(async()=> {
      const state=await this.load();const result=await action(state);
      const temporary=path.join(this.directory,`state-${randomUUID()}.tmp`);
      await writeFile(temporary,JSON.stringify(state,null,2),{mode:0o600});
      await rename(temporary,path.join(this.directory,'state.json'));
      return structuredClone(result);
    });
    this.queue=job.catch(()=>{});return job;
  }
  async inspect(action) {await this.queue;return structuredClone(await action(await this.load()));}
  project(state,id) {return state.projects.find(p=>p.id===id) || fail('공간 프로젝트를 찾을 수 없습니다.',404,'NOT_FOUND');}
  event(state,id) {
    for (const project of state.projects) {const event=project.events.find(e=>e.id===id);if(event)return {project,event};}
    fail('공연을 찾을 수 없습니다.',404,'NOT_FOUND');
  }
  touch(project,event) {event.revision++;event.updatedAt=project.updatedAt=now();
    if(event.publication) event.publication.stale=event.publication.needsReview===true || event.publication.modelHash!==geometryHash(event.model) || event.publication.sessionLabel!==event.sessionLabel;
    return {event};
  }
  listProjects() {return this.inspect(s=>({projects:s.projects.map(p=>({id:p.id,name:p.name,updatedAt:p.updatedAt,eventCount:p.events.length}))}));}
  getProject(id) {return this.inspect(s=>({project:this.project(s,id)}));}
  createProject(input) {return this.transact(s=> {
    if(s.projects.length>=100) fail('시제품 저장소의 프로젝트 한도는 100개입니다.');
    const baseModel=toVenueModel(input.model || DEFAULT_MODEL),name=text(input.name,'공간 이름',40);baseModel.name=name;
    const project={id:randomUUID(),name,baseModel,events:[],createdAt:now(),updatedAt:now()};s.projects.push(project);return {project};
  });}
  createEvent(projectId,input) {return this.transact(s=> {
    const project=this.project(s,projectId);
    if(project.events.length>=100) fail('공간당 공연 한도는 100개입니다.');
    const source=input.cloneEventId?project.events.find(e=>e.id===input.cloneEventId):null;
    if(input.cloneEventId && !source) fail('복제할 공연을 찾을 수 없습니다.',404);
    const model=structuredClone(source?.model || project.baseModel);
    const event={id:randomUUID(),projectId,name:text(input.name,'공연 이름',80),revision:1,model,sessionLabel:'적용 회차 미지정',seatMapping:structuredClone(source?.seatMapping || []),evidence:[],reviews:[],publication:null,createdAt:now(),updatedAt:now()};
    project.events.push(event);project.updatedAt=now();return {event};
  });}
  updateEvent(id,input) {return this.transact(s=> {
    const {project,event}=this.event(s,id);checkRevision(event,input.expectedRevision);
    if(input.model) {event.model=toVenueModel(input.model);event.model.version=event.revision+1;}
    if(input.name!==undefined) event.name=text(input.name,'공연 이름',80);
    if(input.sessionLabel!==undefined) event.sessionLabel=text(input.sessionLabel,'적용 회차',120);
    if(input.seatMapping!==undefined) {
      if(!Array.isArray(input.seatMapping) || input.seatMapping.length>5000) fail('좌석 대응표를 확인하세요.');
      const external=new Set(),internal=new Set(),labels=new Set(event.model.seats.map(x=>x.label));
      event.seatMapping=input.seatMapping.map(m=> {
        const externalId=text(m?.externalId,'외부 좌석 ID',160),seatLabel=text(m?.seatLabel,'내부 좌석',80);
        if(!labels.has(seatLabel) || external.has(externalId) || internal.has(seatLabel)) fail('좌석 대응표에 누락·중복 또는 없는 좌석이 있습니다.');
        external.add(externalId);internal.add(seatLabel);return {externalId,seatLabel};
      });
    }
    if(event.seatMapping.some(m=>!event.model.seats.some(x=>x.label===m.seatLabel))) fail('좌석 이름 변경 후 외부 좌석 대응표도 수정해야 합니다.');
    return this.touch(project,event);
  });}
  addEvidence(id,input) {return this.transact(async s=> {
    const {project,event}=this.event(s,id);checkRevision(event,input.expectedRevision);
    if(event.evidence.length>=100) fail('공연당 현장 사진 한도는 100개입니다.');
    if(!event.model.seats.some(x=>x.label===input.seatLabel)) fail('사진에 대응하는 좌석을 선택하세요.');
    if(typeof input.photoDataUrl!=='string' || input.photoDataUrl.length>2.2*1024*1024) fail('사진은 1.5MB 이하로 압축하세요.',413);
    const match=input.photoDataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!match) fail('JPEG·PNG·WebP 사진이 필요합니다.');
    const bytes=Buffer.from(match[2],'base64');
    const valid=match[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!valid || bytes.length<16 || bytes.length>1.5*1024*1024) fail('사진 파일 형식 또는 크기를 확인하세요.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.capturedAt || '') || !Number.isFinite(Date.parse(input.capturedAt))) fail('사진 촬영일을 입력하세요.');
    if(typeof input.eyeHeightM!=='number' || input.eyeHeightM<.9 || input.eyeHeightM>1.45) fail('촬영 눈높이는 0.9~1.45m여야 합니다.');
    const lens=text(input.lens,'렌즈·화각 조건',160),note=text(input.note,'촬영 조건 메모',500);
    const assetId=randomUUID(),extension=match[1]==='jpeg'?'jpg':match[1];
    const targetId=input.targetId || event.model.activeTargetId;
    if(!event.model.targets.some(t=>t.id===targetId)) fail('사진의 관람 대상을 확인하세요.');
    const evidence={id:randomUUID(),assetId,seatLabel:input.seatLabel,targetId,modelHash:geometryHash(event.model),capturedAt:input.capturedAt,eyeHeightM:input.eyeHeightM,lens,note,sharePhoto:input.sharePhoto===true,createdAt:now()};
    await writeFile(path.join(this.directory,'assets',`${assetId}.${extension}`),bytes,{mode:0o600});
    s.assets.push({id:assetId,filename:`${assetId}.${extension}`,mime:`image/${match[1]}`});event.evidence.push(evidence);
    return {...this.touch(project,event),evidence};
  });}
  addReview(id,input) {return this.transact(s=> {
    const {project,event}=this.event(s,id);checkRevision(event,input.expectedRevision);
    const evidence=event.evidence.find(e=>e.id===input.evidenceId);
    if(!evidence || evidence.modelHash!==geometryHash(event.model)) fail('현재 배치에서 촬영·등록한 사진이 필요합니다.',409,'STALE_EVIDENCE');
    if(!['matched','mismatch'].includes(input.status)) fail('현장 대조 결과를 선택하세요.');
    const review={id:randomUUID(),evidenceId:evidence.id,seatLabel:evidence.seatLabel,targetId:evidence.targetId,modelHash:evidence.modelHash,status:input.status,note:text(input.note,'대조 내용',800),createdAt:now()};
    event.reviews.push(review);
    const published=s.publications.find(p=>p.slug===event.publication?.slug);
    if(input.status==='mismatch' && published?.modelHash===review.modelHash && published.model.seats.some(seat=>seat.label===review.seatLabel) && published.model.targets.some(target=>target.id===review.targetId)) event.publication.needsReview=true;
    return this.touch(project,event);
  });}
  publish(id,input) {return this.transact(s=> {
    const {project,event}=this.event(s,id);checkRevision(event,input.expectedRevision);
    if(input.rightsConfirmed!==true) fail('자료 사용·공개 권한을 확인해야 합니다.');
    if(!['demo','reviewed'].includes(input.mode)) fail('공개 형태를 선택하세요.');
    if(event.sessionLabel==='적용 회차 미지정') fail('공개할 공연의 적용 회차를 먼저 저장하세요.');
    const reviewer=text(input.reviewer,'승인 담당자',80),allowedOrigins=origins(input.allowedOrigins);
    const labels=new Set(event.model.seats.map(s=>s.label)),selected=input.seatLabels;
    if(!Array.isArray(selected) || !selected.length || new Set(selected).size!==selected.length || selected.some(x=>!labels.has(x))) fail('공개할 좌석을 선택하세요.');
    const hash=geometryHash(event.model),evidence=[];
    for(const label of selected) {
      const reviews=event.reviews.filter(r=>r.seatLabel===label && r.modelHash===hash && r.targetId===event.model.activeTargetId);
      const review=reviews.at(-1),photo=event.evidence.find(p=>p.id===review?.evidenceId && p.modelHash===hash);
      if(input.mode==='reviewed' && (review?.status!=='matched' || !photo || Math.abs(photo.eyeHeightM-1.2)>.001)) fail(`${label}: 현재 배치·눈높이 1.2m의 현장 사진과 일치 대조 기록이 필요합니다.`,422,'REVIEW_REQUIRED');
      if(review?.status==='matched' && photo) evidence.push({seatLabel:label,targetId:photo.targetId,assetId:photo.sharePhoto?photo.assetId:null,capturedAt:photo.capturedAt,eyeHeightM:photo.eyeHeightM,lens:photo.lens,reviewedAt:review.createdAt});
    }
    if(event.publication) {const old=s.publications.find(p=>p.slug===event.publication.slug);if(old)old.active=false;}
    const model=structuredClone(event.model);model.seats=model.seats.filter(seat=>selected.includes(seat.label));model.labels=model.seats.map(x=>x.label);
    // Reviewed publication covers only the target compared against the site photo.
    if(input.mode==='reviewed') model.targets=model.targets.filter(target=>target.id===model.activeTargetId);
    const publication={slug:randomUUID(),eventId:id,projectId:project.id,active:true,model,modelHash:hash,eventName:event.name,sessionLabel:event.sessionLabel,sourceRevision:event.revision,mode:input.mode,reviewer,allowedOrigins,evidence,
      seatMapping:event.seatMapping.filter(m=>selected.includes(m.seatLabel)),publishedAt:now(),stats:{view:0,compare:0,ticket_out:0}};
    s.publications.push(publication);
    const summary={slug:publication.slug,modelHash:hash,sessionLabel:event.sessionLabel,publishedAt:publication.publishedAt,mode:publication.mode,stale:false,viewerUrl:`/viewer.html?publication=${publication.slug}`,embedUrl:`/viewer.html?publication=${publication.slug}`};
    event.publication=summary;this.touch(project,event);return {event,publication:summary};
  });}
  unpublish(id,input) {return this.transact(s=> {
    const {project,event}=this.event(s,id);checkRevision(event,input.expectedRevision);
    const p=s.publications.find(p=>p.slug===event.publication?.slug);if(p)p.active=false;
    event.publication=null;return this.touch(project,event);
  });}
  livePublication(s,slug) {
    const p=s.publications.find(x=>x.slug===slug);
    if(!p) fail('시야 안내 페이지를 찾을 수 없습니다.',404,'NOT_FOUND');
    const {event}=this.event(s,p.eventId);
    if(!p.active || event.publication?.slug!==slug || event.publication.stale) fail('게시가 중지됐거나 배치가 변경돼 재검토 중입니다.',410,'PUBLICATION_STOPPED');
    return p;
  }
  publication(slug) {return this.inspect(s=> {
    const p=this.livePublication(s,slug);
    const {reviewer,stats,eventId,projectId,active,...publicData}=p;
    return {publication:publicData};
  });}
  asset(id,slug) {return this.inspect(s=> {
    if(slug) {const p=this.livePublication(s,slug);if(!p.evidence.some(e=>e.assetId===id)) fail('공개 승인된 사진이 아닙니다.',404);}
    const asset=s.assets.find(a=>a.id===id);if(!asset) fail('사진을 찾을 수 없습니다.',404);
    return {...asset,path:path.join(this.directory,'assets',asset.filename)};
  });}
  metric(slug,input) {return this.transact(s=> {
    if(!['view','compare','ticket_out'].includes(input.kind)) fail('지원하지 않는 사용 기록입니다.');
    const p=this.livePublication(s,slug);p.stats[input.kind]++;return {ok:true};
  });}
  eventStats(id) {return this.inspect(s=> {this.event(s,id);return {stats:s.publications.filter(p=>p.eventId===id).reduce((a,p)=>{for(const k of Object.keys(a))a[k]+=p.stats[k];return a;},{view:0,compare:0,ticket_out:0})};});}
}
