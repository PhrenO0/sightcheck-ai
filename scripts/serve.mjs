import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi, publicationPolicy } from '../dist/server/api.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.SIGHTCHECK_PORT || 4173);
const host=process.env.SIGHTCHECK_HOST || '127.0.0.1';
if(!['127.0.0.1','localhost','::1'].includes(host) && (process.env.SIGHTCHECK_ADMIN_TOKEN || '').length<24) throw new Error('외부 호스트 실행에는 24자 이상의 SIGHTCHECK_ADMIN_TOKEN과 HTTPS 프록시가 필요합니다.');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.wasm':'application/wasm','.gz':'application/gzip','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  if (await handleApi(req,res)) return;
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); res.end(); return;}
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root,filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || filename.includes('\0')) {res.writeHead(403); res.end(); return;}
    if (!(await stat(filename)).isFile()) {res.writeHead(404);res.end();return;}
    const data = await readFile(filename);
    let framePolicy="frame-ancestors 'self'";
    if(pathname==='/viewer.html') {try{const slug=new URL(req.url,'http://localhost').searchParams.get('publication');const origins=await publicationPolicy(slug);framePolicy+=' '+origins.join(' ');}catch{}}
    res.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Content-Length':data.length,'Cache-Control':pathname.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':framePolicy});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? `포트 ${port}을 이미 사용 중입니다. SIGHTCHECK_PORT로 다른 포트를 지정하세요.` : error.message);process.exitCode = 1;});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(port,host,() => console.log(`시야체크: http://${host}:${port}/operator.html`));
