import { mkdir, cp, readdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const dest = path.join(root, 'public', 'ocr');
await mkdir(dest, { recursive: true });
const tessRoot = path.dirname(require.resolve('tesseract.js/package.json'));
const coreRoot = path.dirname(require.resolve('tesseract.js-core/package.json', { paths: [tessRoot] }));
await copyFile(path.join(tessRoot, 'dist', 'worker.min.js'), path.join(dest, 'worker.min.js'));
for (const file of await readdir(coreRoot)) {
  if (file.endsWith('.wasm') || file.endsWith('.wasm.js')) await copyFile(path.join(coreRoot, file), path.join(dest, file));
}
const dataRoot = path.dirname(require.resolve('@tesseract.js-data/eng/package.json'));
await cp(path.join(dataRoot, '4.0.0_best_int', 'eng.traineddata.gz'), path.join(dest, 'eng.traineddata.gz'));
const licenseDest = path.join(root, 'public', 'licenses');
await mkdir(licenseDest, { recursive: true });
for (const [name, packageRoot] of [['three',path.resolve(path.dirname(require.resolve('three')), '..')], ['tesseract.js',tessRoot], ['tesseract.js-core',coreRoot], ['vite',path.dirname(require.resolve('vite/package.json'))]]) {
  const files = await readdir(packageRoot);
  const file = files.find(name => /^license(?:\.md|\.txt)?$/i.test(name));
  if (file) await copyFile(path.join(packageRoot,file), path.join(licenseDest, `${name}.txt`));
}
await writeFile(path.join(licenseDest,'ocr-data-package.txt'), '@tesseract.js-data/eng 1.0.0\nPackage metadata license: MIT\nRepository: https://github.com/naptha/tessdata\nContributors: Balearica, jeromewu\nUnderlying Tesseract language data: Apache-2.0 (see tessdata-best.txt).\n');
console.log('OCR worker, WASM, and English model prepared locally.');
