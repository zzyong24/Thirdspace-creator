#!/usr/bin/env node
// 独立开源工作台可重建；安装和构建只在临时目录，宿主不接管上游依赖。
import {readFile,writeFile,mkdtemp,cp,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const manifest=JSON.parse(await readFile(path.join(root,'reference-editors/manifest.json'),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function verify(){for(const [editor,entry] of Object.entries(manifest)){
 if(sha(await readFile(path.join(root,'reference-editors',editor,'source.tar.gz')))!==entry.sourceArchiveSha256)throw Error(`${editor} 源归档校验失败`);
 for(const [file,hash] of Object.entries(entry.bundleFiles))if(sha(await readFile(path.join(root,'frontend/public/reference-editors',editor,file)))!==hash)throw Error(`${editor}/${file} 产物校验失败`);
 console.log(`${editor}：源码与 ${Object.keys(entry.bundleFiles).length} 个静态文件校验通过`);
}}
function run(cmd,args,cwd){const result=spawnSync(cmd,args,{cwd,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error(`${cmd} 退出 ${result.status}`);}
async function build(editor){if(!manifest[editor])throw Error('请选择 kuaitu 或 opencut-classic');await verify();const dir=await mkdtemp(path.join(os.tmpdir(),'creatoros-editor-rebuild-'));
 try{run('tar',['-xzf',path.join(root,'reference-editors',editor,'source.tar.gz'),'-C',dir],root);const src=dir;
 if(editor==='kuaitu'){run('npx',['--yes','--registry=https://registry.npmjs.org','pnpm@8.15.9','install','--frozen-lockfile','--ignore-scripts','--registry=https://registry.npmjs.org'],src);run(path.join(src,'node_modules/.bin/vite'),['build','--base','./'],src);await cp(path.join(src,'dist'),path.join(root,'frontend/public/reference-editors',editor),{recursive:true});}
 else{run('bun',['install','--frozen-lockfile','--ignore-scripts'],src);run('bun',['../../node_modules/vite/bin/vite.js','build','--config','vite.embedded.config.ts'],path.join(src,'apps/web'));await cp(path.join(src,'apps/web/embedded-dist'),path.join(root,'frontend/public/reference-editors',editor),{recursive:true});}
 console.log(`已重建 ${editor}，修改源或产物后须重录 manifest 并复验，不能伪称旧hash通过。`);
 }finally{await rm(dir,{recursive:true,force:true});}}
if(process.argv.includes('--build'))await build(process.argv.at(-1));else await verify();
