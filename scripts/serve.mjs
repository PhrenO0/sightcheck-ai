import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.SIGHTCHECK_PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.json':'application/json','.wasm':'application/wasm','.gz':'application/gzip','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); res.end(); return;}
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root,filename);
    if (relative.startsWith('..') || path.isAbsolute(relative) || filename.includes('\0')) {res.writeHead(403); res.end(); return;}
    if (!(await stat(filename)).isFile()) {res.writeHead(404);res.end();return;}
    const data = await readFile(filename);
    res.writeHead(200, {'Content-Type':mime[path.extname(filename)] || 'application/octet-stream','Content-Length':data.length,'Cache-Control':pathname.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {res.writeHead(404);res.end('Not found');}
});
server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? `포트 ${port}을 이미 사용 중입니다. SIGHTCHECK_PORT로 다른 포트를 지정하세요.` : error.message);process.exitCode = 1;});
server.listen(port,'127.0.0.1',() => console.log(`시야체크: http://127.0.0.1:${port}/`));
