import { defineConfig } from '../../../../../frontend/node_modules/vite/dist/node/index.js';
import react from '../../../../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import tailwind from '../../../../../frontend/node_modules/@tailwindcss/postcss/dist/index.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../../..');
export default defineConfig({root:here, plugins:[react()], resolve:{alias:{'@':path.join(repo,'frontend/src'),'react':path.join(repo,'frontend/node_modules/react'),'react-dom':path.join(repo,'frontend/node_modules/react-dom'),'@tauri-apps/api/core':path.join(here,'native-fixture.ts'),'@tauri-apps/plugin-opener':path.join(here,'native-fixture.ts'),'@tauri-apps/plugin-process':path.join(here,'native-fixture.ts')},dedupe:['react','react-dom']},css:{postcss:{plugins:[tailwind({base:path.join(repo,'frontend')})]}},server:{host:'127.0.0.1',port:5179,strictPort:true,fs:{allow:[repo]}}});
