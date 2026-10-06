import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

export default defineConfig({
  root:fileURLToPath(new URL('./showcase',import.meta.url)),
  publicDir:false,
  build:{outDir:fileURLToPath(new URL('./site-dist',import.meta.url)),emptyOutDir:true},
  plugins:[{
    name:'showcase-license-notices',
    generateBundle() {
      for (const name of ['three','vite']) this.emitFile({
        type:'asset',fileName:`licenses/${name}.txt`,
        source:readFileSync(new URL(`./public/licenses/${name}.txt`,import.meta.url),'utf8'),
      });
    },
  }],
});
