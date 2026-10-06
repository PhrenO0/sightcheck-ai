import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'output/netlify-publish');
await mkdir(dir,{recursive:true});
let html=await readFile(path.join(root,'output/html-showcase/시야체크_AI_소개.html'),'utf8');
const marker='<div class="footer-links">';
if(!html.includes(marker)) throw new Error('Expected showcase footer');
html=html.replace(marker,()=>`${marker}<a href="/sightcheck-ai.pdf" target="_blank" rel="noopener">서비스 소개 PDF ↗</a>`);
await writeFile(path.join(dir,'index.html'),html,'utf8');
await copyFile(path.join(root,'output/pdf/시야체크_AI_서비스소개.pdf'),path.join(dir,'sightcheck-ai.pdf'));
await writeFile(path.join(dir,'_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/sightcheck-ai.pdf\n  Content-Type: application/pdf\n`);
console.log(`Netlify publish directory: ${dir}`);
