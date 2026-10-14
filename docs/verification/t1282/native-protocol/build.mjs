import {build} from '/tmp/creatoros-t1274-preview-isolated/node_modules/vite/dist/node/index.js';
import wasm from '/tmp/creatoros-t1274-preview-isolated/node_modules/vite-plugin-wasm/dist/index.js';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
await build({configFile:false,root,plugins:[wasm()],resolve:{alias:[{find:/^opencut-wasm$/,replacement:root+'real-wasm-tap.ts'},{find:'@',replacement:'/tmp/creatoros-t1274-preview-isolated/apps/web/src'}]},build:{target:'esnext',outDir:'/tmp/t1282-native-protocol-dist',emptyOutDir:true,lib:{entry:root+'probe.ts',formats:['es'],fileName:()=> 'probe.js'}}});
