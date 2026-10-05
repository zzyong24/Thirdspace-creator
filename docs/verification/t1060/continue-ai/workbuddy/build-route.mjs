import {build} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/mcp-server/node_modules/esbuild/lib/main.js';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const repo='/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator';
const require=createRequire(join(repo,'frontend/package.json'));
await build({entryPoints:[join(repo,'frontend/src/app/api/v1/dispatch/route.ts')],outfile:'/tmp/t1060-ai-business/continue-workbuddy/original-route.mjs',platform:'node',format:'esm',target:'node25',bundle:true,metafile:true,plugins:[{name:'isolated-real-service-host',setup(b){
 b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'test-server-boundary'}));
 b.onLoad({filter:/.*/,namespace:'test-server-boundary'},()=>({contents:'export {};',loader:'js'}));
 b.onResolve({filter:/^@\/server\/persistence-client$/},()=>({path:'/tmp/t1060-ai-business/continue-workbuddy/persistence-shim.ts'}));
 b.onResolve({filter:/^@\//},args=>({path:join(repo,'frontend/src',args.path.slice(2)+'.ts')}));
 b.onResolve({filter:/^[^./]/},args=>{if(args.path.startsWith('node:'))return {path:args.path,external:true};return {path:require.resolve(args.path),external:true};});
}}]}).then(async r=>{const {writeFile}=await import('node:fs/promises');await writeFile('/tmp/t1060-ai-business/continue-workbuddy/route-metafile.json',JSON.stringify(r.metafile,null,2));});
