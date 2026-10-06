import { readFile, writeFile, realpath, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'site-dist');
let html=await readFile(path.join(output,'index.html'),'utf8');
const scriptTags=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
const styles=[...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)];
if(scriptTags.length!==1 || styles.length!==1) throw new Error('Expected one bundled JavaScript file and one CSS file.');
const localAsset=url=>{const resolved=path.resolve(output,`.${url}`);if(!resolved.startsWith(output+path.sep))throw new Error('Asset must be inside site-dist.');return resolved;};
const js=await readFile(localAsset(scriptTags[0][1]),'utf8');
let css=await readFile(localAsset(styles[0][1]),'utf8');
const font=await readFile(path.join(root,'showcase/references/NotoSansKR-subset.woff2'));
if(font.subarray(0,4).toString()!=='wOF2') throw new Error('Expected a WOFF2 font subset.');
css=css.replace(/@import\s*(?:url\([^)]*\)|["'][^"']*["'])\s*;/g,'');
css=`@font-face{font-family:'Noto Sans KR';font-style:normal;font-weight:400 900;src:url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');font-display:swap;}${css}`;
if(/\bimport\s*\(/.test(js)) throw new Error('Dynamic chunks must be inlined before producing a standalone HTML file.');
html=html.replace(scriptTags[0][0],'');
html=html.replace(styles[0][0],()=>`<style>${css.replace(/<\/style/gi,'<\\/style')}</style>`);
const motionRequire=createRequire(await realpath(path.join(root,'node_modules/motion/package.json')));
const framerDir=path.dirname(motionRequire.resolve('framer-motion/package.json'));
const framerRequire=createRequire(path.join(framerDir,'package.json'));
async function packageDirectory(name) {
  let dir=path.dirname(framerRequire.resolve(name));
  for(let i=0;i<8;i++) {
    try {if(JSON.parse(await readFile(path.join(dir,'package.json'),'utf8')).name===name) return dir;} catch(error) {if(error.code!=='ENOENT')throw error;}
    const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
  }
  throw new Error(`Cannot locate license directory for ${name}`);
}
const motionDomDir=await packageDirectory('motion-dom');
const motionUtilsDir=await packageDirectory('motion-utils');
const tslibDir=await packageDirectory('tslib');
const licenses={
  'Three.js':await readFile(path.join(root,'public/licenses/three.txt'),'utf8'),
  'Vite and bundled dependencies':await readFile(path.join(root,'public/licenses/vite.txt'),'utf8'),
  'Motion':await readFile(path.join(root,'node_modules/motion/LICENSE.md'),'utf8'),
  'Framer Motion':await readFile(path.join(framerDir,'LICENSE.md'),'utf8'),
  'Motion DOM':await readFile(path.join(motionDomDir,'LICENSE.md'),'utf8'),
  'Motion Utils':await readFile(path.join(motionUtilsDir,'LICENSE.md'),'utf8'),
  'tslib':`${await readFile(path.join(tslibDir,'CopyrightNotice.txt'),'utf8')}\n${await readFile(path.join(tslibDir,'LICENSE.txt'),'utf8')}`,
  'Lenis':await readFile(path.join(root,'node_modules/lenis/LICENSE'),'utf8'),
  'OpenDesign references':await readFile(path.join(root,'showcase/references/OpenDesign-LICENSE.txt'),'utf8'),
  'Noto Sans KR':await readFile(path.join(root,'showcase/references/NotoSansKR-OFL.txt'),'utf8'),
};
const escapeScript=text=>text.replace(/<\/script/gi,'<\\/script');
html=html.replace('</body>',()=>`<script id="opensource-licenses" type="application/json">${escapeScript(JSON.stringify(licenses))}</script><script type="module">${escapeScript(js)}</script></body>`);
const file=path.join(output,'시야체크_AI_소개.html');
await writeFile(file,html,'utf8');
const deliveryDir=path.join(root,'output/html-showcase');
await mkdir(deliveryDir,{recursive:true});
await writeFile(path.join(deliveryDir,'시야체크_AI_소개.html'),html,'utf8');
console.log(`Standalone HTML: ${file} (${(Buffer.byteLength(html)/1024).toFixed(0)} KiB)`);
console.log(`Delivery copy: ${path.join(deliveryDir,'시야체크_AI_소개.html')}`);
