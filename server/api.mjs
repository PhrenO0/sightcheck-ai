import { convertPlan, calculateSeat } from '../src/conversion.js';

export async function handleApi(req, res) {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!pathname.startsWith('/api/')) return false;
  const send = (status, data) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data));};
  if (pathname === '/api/health' && req.method === 'GET') {send(200, {ok:true, engineVersion:'0.2.0', storage:'none', maxSeats:300}); return true;}
  if (!['/api/v1/convert', '/api/v1/sightline'].includes(pathname)) {send(404, {error:'API를 찾을 수 없습니다.'}); return true;}
  if (req.method !== 'POST') {send(405, {error:'POST 요청이 필요합니다.'}); return true;}
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) {send(403, {error:'다른 출처의 브라우저 요청은 허용하지 않습니다.'}); return true;}
  if (!(req.headers['content-type'] || '').startsWith('application/json')) {send(415, {error:'application/json이 필요합니다.'}); return true;}
  try {
    let bytes = 0; const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 512 * 1024) {send(413, {error:'요청은 512KB 이하여야 합니다.'}); return true;}
      chunks.push(chunk);
    }
    let input; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {send(400, {error:'JSON을 읽지 못했습니다.'}); return true;}
    send(200, pathname.endsWith('/convert') ? convertPlan(input) : calculateSeat(input));
  } catch(error) {send(422, {error:error.message, field:error.field || 'model'});}
  return true;
}
