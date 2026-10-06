import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {convertPlan,calculateSeat} from '../src/conversion.js';
import {Repository,ServiceError} from './repository.mjs';

const isLoopback=value=>['127.0.0.1','::1','::ffff:127.0.0.1'].includes(value);
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
async function body(req) {
  if(!(req.headers['content-type'] || '').startsWith('application/json')) throw new ServiceError('application/json이 필요합니다.',415);
  let bytes=0;const chunks=[];
  for await(const chunk of req) {bytes+=chunk.length;if(bytes>3*1024*1024) throw new ServiceError('요청은 3MB 이하여야 합니다.',413);chunks.push(chunk);}
  try {const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!input || Array.isArray(input) || typeof input!=='object') throw new Error();return input;} catch {throw new ServiceError('JSON을 읽지 못했습니다.',400);}
}
export function createApiHandler({repository=new Repository(process.env.SIGHTCHECK_DATA_DIR || path.resolve('data')),adminToken=process.env.SIGHTCHECK_ADMIN_TOKEN || ''}={}) {
  const sessions=new Map(),attempts=new Map();
  if(adminToken && adminToken.length<24) throw new Error('SIGHTCHECK_ADMIN_TOKEN은 24자 이상이어야 합니다.');
  return async function api(req,res) {
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith('/api/')) return false;
    const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(data));};
    try {
      if(pathname==='/api/health' && req.method==='GET') {send(200,{ok:true,engineVersion:'0.3.0',storage:'filesystem',maxSeats:300,maxVenueSeats:5000,authMode:adminToken?'token':'local'});return true;}
      const isPublic=/^\/api\/v1\/publications\/[a-f0-9-]+(?:\/assets\/[a-f0-9-]+|\/metrics)?$/.test(pathname);
      const host=new URL(`http://${req.headers.host || 'invalid'}`).hostname;
      const local=isLoopback(req.socket.remoteAddress)&&['127.0.0.1','localhost','[::1]'].includes(host);
      const cookies=Object.fromEntries((req.headers.cookie || '').split(';').map(p=>p.trim().split('=')));
      const session=sessions.get(cookies.sightcheck_session),bearer=(req.headers.authorization || '').replace(/^Bearer /,'');
      const authenticated=adminToken?(!!session&&session>Date.now())|| (!!bearer&&equal(bearer,adminToken)):local;
      if(!['GET','HEAD'].includes(req.method)) {
        const origin=req.headers.origin;
        if((origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)||req.headers['sec-fetch-site']==='cross-site') throw new ServiceError('다른 출처의 브라우저 요청은 허용하지 않습니다.',403);
      }
      if(pathname==='/api/v1/auth') {
        if(req.method==='GET') {send(200,{mode:adminToken?'token':'local',authenticated});return true;}
        if(req.method==='DELETE') {sessions.delete(cookies.sightcheck_session);send(200,{ok:true},{'Set-Cookie':'sightcheck_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return true;}
        if(req.method!=='POST') throw new ServiceError('허용하지 않는 요청입니다.',405);
        if(!adminToken) {if(!local) throw new ServiceError('로컬 모드는 이 PC에서만 사용할 수 있습니다.',403);send(200,{authenticated:true});return true;}
        const input=await body(req),key=req.socket.remoteAddress;
        const attempt=attempts.get(key);if(attempt?.until>Date.now()&&attempt.count>=10) throw new ServiceError('잠시 후 다시 로그인하세요.',429);
        if(typeof input.token!=='string'||!equal(input.token,adminToken)) {attempts.set(key,{count:attempt?.until>Date.now()?attempt.count+1:1,until:Date.now()+60000});throw new ServiceError('운영자 접근 키가 올바르지 않습니다.',401);}
        attempts.delete(key);for(const [id,expiry] of sessions)if(expiry<Date.now())sessions.delete(id);
        const id=randomBytes(32).toString('hex');sessions.set(id,Date.now()+8*3600000);
        const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';
        send(200,{authenticated:true},{'Set-Cookie':`sightcheck_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`});return true;
      }
      if(!isPublic&&!authenticated) throw new ServiceError(adminToken?'운영자 로그인이 필요합니다.':'로컬 모드는 이 PC에서만 사용할 수 있습니다.',adminToken?401:403,'AUTH_REQUIRED');
      if(pathname==='/api/v1/convert'||pathname==='/api/v1/sightline') {if(req.method!=='POST') throw new ServiceError('POST 요청이 필요합니다.',405);const input=await body(req);send(200,pathname.endsWith('/convert')?convertPlan(input):calculateSeat(input));return true;}
      if(pathname==='/api/v1/projects') {if(req.method==='GET')send(200,await repository.listProjects());else if(req.method==='POST')send(201,await repository.createProject(await body(req)));else throw new ServiceError('허용하지 않는 요청입니다.',405);return true;}
      let match=pathname.match(/^\/api\/v1\/projects\/([a-f0-9-]+)(\/events)?$/);
      if(match) {if(!match[2]&&req.method==='GET')send(200,await repository.getProject(match[1]));else if(match[2]&&req.method==='POST')send(201,await repository.createEvent(match[1],await body(req)));else throw new ServiceError('허용하지 않는 요청입니다.',405);return true;}
      match=pathname.match(/^\/api\/v1\/events\/([a-f0-9-]+)(?:\/(evidence|reviews|publish|unpublish|stats))?$/);
      if(match) {
        const id=match[1],action=match[2];
        if(action==='stats'&&req.method==='GET')send(200,await repository.eventStats(id));
        else if(!action&&req.method==='PATCH')send(200,await repository.updateEvent(id,await body(req)));
        else if(action&&req.method==='POST'&&action!=='stats') {const method={evidence:'addEvidence',reviews:'addReview',publish:'publish',unpublish:'unpublish'}[action];send(200,await repository[method](id,await body(req)));}
        else throw new ServiceError('허용하지 않는 요청입니다.',405);return true;
      }
      match=pathname.match(/^\/api\/v1\/publications\/([a-f0-9-]+)(?:\/(assets\/([a-f0-9-]+)|metrics))?$/);
      if(match) {
        if(!match[2]&&req.method==='GET')send(200,await repository.publication(match[1]));
        else if(match[2]==='metrics'&&req.method==='POST')send(200,await repository.metric(match[1],await body(req)));
        else if(match[3]&&req.method==='GET') {const asset=await repository.asset(match[3],match[1]),data=await readFile(asset.path);res.writeHead(200,{'Content-Type':asset.mime,'Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);}
        else throw new ServiceError('허용하지 않는 요청입니다.',405);return true;
      }
      match=pathname.match(/^\/api\/v1\/assets\/([a-f0-9-]+)$/);
      if(match&&req.method==='GET') {const asset=await repository.asset(match[1]),data=await readFile(asset.path);res.writeHead(200,{'Content-Type':asset.mime,'Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(data);return true;}
      throw new ServiceError('API를 찾을 수 없습니다.',404);
    } catch(error) {
      const status=error.status||(error.code==='ENOENT'?404:error instanceof TypeError?422:error.code?500:422);
      send(status,{error:status>=500?'저장소 처리에 실패했습니다. 서버 로그와 저장 경로를 확인하세요.':error.message,code:error.code||'INVALID_INPUT',field:error.field||undefined});
    }
    return true;
  };
}
const defaultRepository=new Repository(process.env.SIGHTCHECK_DATA_DIR || path.resolve('data'));
export const handleApi=createApiHandler({repository:defaultRepository});
export async function publicationPolicy(slug) {return (await defaultRepository.publication(slug)).publication.allowedOrigins;}
