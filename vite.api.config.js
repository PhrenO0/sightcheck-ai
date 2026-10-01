import { defineConfig } from 'vite';
export default defineConfig({build:{lib:{entry:'server/api.mjs',formats:['es'],fileName:() => 'api.mjs'},outDir:'dist/server',emptyOutDir:false,minify:true}});
