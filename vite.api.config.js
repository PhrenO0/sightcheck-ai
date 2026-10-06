import { defineConfig } from 'vite';
export default defineConfig({build:{target:'node22',rollupOptions:{external:[/^node:/]},lib:{entry:{api:'server/api.mjs',demo:'scripts/create-demo.mjs'},formats:['es'],fileName:(_format,name) => `${name}.mjs`},outDir:'dist/server',emptyOutDir:false,minify:true}});
