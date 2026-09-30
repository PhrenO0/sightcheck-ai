import { createWorker, PSM } from 'tesseract.js';
import { parseCandidates } from '../src/ocr.js';
import path from 'node:path';
const worker = await createWorker('eng', 1, {langPath:path.resolve('public/ocr'),cacheMethod:'none'});
try {
  await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',user_defined_dpi:'150'});
  const {data} = await worker.recognize('public/sample-seatmap.png', {}, {text:true,blocks:true});
  const candidates = parseCandidates(data);
  console.log(JSON.stringify({rawText:data.text,count:candidates.length,labels:candidates.map(x=>x.label)},null,2));
  if (candidates.length !== 20) process.exitCode = 1;
} finally {await worker.terminate();}
