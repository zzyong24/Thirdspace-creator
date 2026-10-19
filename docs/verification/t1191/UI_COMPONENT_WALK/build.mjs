import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const N=path.dirname(new URL(import.meta.url).pathname);
const W=process.env.HARNESS_SOURCE_ROOT??'/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator';
const tag=process.env.HARNESS_BUILD_TAG??'current';
const req=createRequire(path.join(W,'frontend/package.json'));
const esbuild=req('esbuild');
const twPath=req.resolve('@tailwindcss/postcss');
const tw=req('@tailwindcss/postcss');
const postcss=createRequire(twPath)('postcss');
// Next normally inlines these known public package-brand fields. They are absent
// in this neutral fixture; preserve source fallback behavior without a global process shim.
const define={'process.env.NODE_ENV':'"development"'};
for(const key of ['BRAND_NAME','SIDEBAR_THEME','BRAND_ICON_DATA_URL','REF','WEBSITE_URL','DOWNLOAD_URL','HUMAN_FEEDBACK_URL','UPDATE_MANIFEST_URL'])define['process.env.NEXT_PUBLIC_CREATOROS_PACKAGE_'+key]='undefined';
await fs.mkdir(path.join(N,'dist'),{recursive:true});
const cssPath=path.join(W,'frontend/src/app/globals.css');
const css=await postcss([tw({base:path.join(W,'frontend')})]).process(await fs.readFile(cssPath,'utf8'),{from:cssPath,to:path.join(N,'dist/theme.css')});
await fs.writeFile(path.join(N,'dist/theme.css'),css.css);
const result=await esbuild.build({entryPoints:[path.join(N,process.env.HARNESS_ENTRY??'main.tsx')],bundle:true,outfile:path.join(N,'dist/app.js'),format:'esm',platform:'browser',jsx:'automatic',nodePaths:[path.join(W,'frontend/node_modules'),path.join(W,'node_modules')],alias:{'@':path.join(W,'frontend/src'),'next/navigation':path.join(N,'next-navigation.ts'),'next/link':path.join(N,'next-link.tsx'),'@/lib/contract-client':path.join(N,'contract-client.ts')},plugins:[{name:'isolated-boundaries',setup(build){build.onResolve({filter:/^\.\/use-assistant-engine$/},args=>args.importer===path.join(W,'frontend/src/features/copilot/ai-copilot-content.tsx')?{path:path.join(N,'engine.ts')}:null);build.onResolve({filter:/^@\/lib\/contract-client$/},()=>({path:path.join(N,'contract-client.ts')}));build.onResolve({filter:/ai-copilot-content$/},args=>process.env.HARNESS_HOST==='global'&&args.importer===path.join(W,'frontend/src/components/overlays/ai-copilot-dialog.tsx')?{path:path.join(N,'global-content-slot.tsx')}:null);}}],loader:{'.woff2':'file','.woff':'file','.ttf':'file','.png':'file','.svg':'file'},metafile:true,define});
await fs.copyFile(path.join(N,process.env.HARNESS_INDEX??'index.html'),path.join(N,'dist/index.html'));
const sourceFiles=Object.keys(result.metafile.inputs).map(p=>path.isAbsolute(p)?p:path.resolve(p)).filter(p=>p.startsWith(W+'/')&&!p.includes('/node_modules/'));
for(const p of [cssPath,path.join(W,'frontend/src/styles/tokens.css'),path.join(W,'frontend/src/features/copilot/ai-copilot-content.test.tsx')])if(!sourceFiles.includes(p))sourceFiles.push(p);
const hashes={};for(const p of sourceFiles)hashes[path.relative(W,p)]=crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const manifest={tag,host:process.env.HARNESS_HOST??'original-private',entry:process.env.HARNESS_ENTRY??'main.tsx',index:process.env.HARNESS_INDEX??'index.html',at:new Date().toISOString(),sourceRoot:W,head:execFileSync('git',['rev-parse','HEAD'],{cwd:W,encoding:'utf8'}).trim(),hashes,sourceInputs:sourceFiles.length,boundaryMocks:['next/navigation','next/link host','contract-client empty read-only lists','assistant engine hook','EditorPort fixture','window.fetch transport boundary;503 only;no success/task receipts'],realComponents:['AICopilotContent','DraftChatRequestProvider','Chat/useChat','live-chat-session','actual descendant components','globals.css/tokens.css','Noto Sans SC font'],metafile:result.metafile};
await fs.writeFile(path.join(N,`${tag}-source-manifest.json`),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({status:'built',head:manifest.head,sourceInputs:sourceFiles.length,tag,outdir:path.join(N,'dist')}));
