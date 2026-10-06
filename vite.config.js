import { defineConfig } from 'vite';
import { handleApi } from './server/api.mjs';
export default defineConfig({build:{rollupOptions:{input:{main:'index.html',operator:'operator.html',viewer:'viewer.html',integration:'integration.html'}}},plugins:[{name:'sightcheck-api', configureServer(server) {
  server.middlewares.use((req,res,next) => {handleApi(req,res).then(handled => {if (!handled) next();}).catch(next);});
}}]});
