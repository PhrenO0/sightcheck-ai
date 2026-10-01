import { defineConfig } from 'vite';
import { handleApi } from './server/api.mjs';
export default defineConfig({plugins:[{name:'sightcheck-api', configureServer(server) {
  server.middlewares.use((req,res,next) => {handleApi(req,res).then(handled => {if (!handled) next();}).catch(next);});
}}]});
