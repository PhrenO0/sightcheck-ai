import {Repository} from '../server/repository.mjs';
import {toVenueModel,DEFAULT_MODEL} from '../src/model.js';
import path from 'node:path';
const repo=new Repository(process.env.SIGHTCHECK_DATA_DIR || path.resolve('data'));
const existing=(await repo.listProjects()).projects;
if(existing.some(p=>p.name==='가상 도입 시연 공간')) {console.log('가상 도입 시연 공간이 이미 있습니다. 기존 자료를 유지합니다.');process.exit(0);}
const {project}=await repo.createProject({name:'가상 도입 시연 공간'});
const base=(await repo.createEvent(project.id,{name:'뮤지컬 · 가상 배치'})).event;
const saved=(await repo.updateEvent(base.id,{expectedRevision:base.revision,sessionLabel:'시제품 시연 · 실제 공연 아님'})).event;
await repo.publish(saved.id,{expectedRevision:saved.revision,mode:'demo',seatLabels:saved.model.seats.map(s=>s.label),rightsConfirmed:true,reviewer:'가상 자료 제작',allowedOrigins:[]});
const cinema=toVenueModel(DEFAULT_MODEL);cinema.venueType='cinema';cinema.name='가상 상영관';cinema.targets=[{id:'screen',name:'스크린 전체',position:[0,3,-2],size:[12,5],rotation:[0,0,0]}];cinema.activeTargetId='screen';cinema.obstacles=[];
cinema.seats=Array.from({length:32},(_,i)=>({label:`${'ABCD'[Math.floor(i/8)]}${i%8+1}`,row:Math.floor(i/8),section:'상영관',x:(i%8-3.5)*.8,z:5+Math.floor(i/8)*1.25,floor:Math.floor(i/8)*.35,yaw:0}));
const c=(await repo.createEvent(project.id,{name:'영화관 · 가상 스크린'})).event;
await repo.updateEvent(c.id,{expectedRevision:c.revision,model:cinema,sessionLabel:'시제품 시연 · 실제 상영관 아님'});
const stadium=toVenueModel(DEFAULT_MODEL);stadium.venueType='stadium';stadium.name='가상 경기장';stadium.targets=[{id:'field',name:'그라운드',position:[0,.05,0],size:[32,20],rotation:[-90,0,0]},{id:'board',name:'전광판',position:[0,8,-24],size:[9,5],rotation:[0,0,0]}];stadium.activeTargetId='field';stadium.obstacles=[];
stadium.seats=Array.from({length:40},(_,i)=>{const a=2*Math.PI*i/40,x=24*Math.sin(a),z=20*Math.cos(a);return {label:`구역${Math.floor(i/10)+1}-${i%10+1}`,row:0,section:`${Math.floor(i/10)+1}구역`,x,z,floor:3,yaw:a*180/Math.PI>180?a*180/Math.PI-360:a*180/Math.PI};});
const g=(await repo.createEvent(project.id,{name:'경기장 · 가상 관람 대상'})).event;
await repo.updateEvent(g.id,{expectedRevision:g.revision,model:stadium,sessionLabel:'시제품 시연 · 실제 경기장 아님'});
console.log('가상 뮤지컬·영화관·경기장 예시를 서버 저장소에 추가했습니다. 실제 시야 실증 자료는 아닙니다.');
