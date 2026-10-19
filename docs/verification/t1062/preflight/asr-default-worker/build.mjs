import fs from 'node:fs/promises';
import {createReadStream,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {piRuntimeInitializationPlugin} from '/Users/zyongzhu/.codex/worktrees/t1062-migration-convergence/Thirdspace-creator/ai-worker/scripts/pi-runtime-bundle.mjs';
const dir='/tmp/t1062-default-worker-preflight';
const registry=JSON.parse(await fs.readFile(path.join(dir,'registry.json'),'utf8'));
const sha=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
const output=path.join(dir,'run-one'),cacheRoot=path.join(output,'cache'),cwd=path.join(output,'runtime','frontend');
await fs.mkdir(cwd,{recursive:true});
for(const f of registry.modelFiles){const original=path.join(registry.originDirectory,f.path),target=path.join(cacheRoot,f.path);if(await sha(original)!==f.sha256)throw Error('original model SHA mismatch');await fs.mkdir(path.dirname(target),{recursive:true});try{await fs.copyFile(original,target,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}if(await sha(target)!==f.sha256)throw Error('copied model SHA mismatch');}
if(await sha(path.join(registry.originDirectory,'audio.wav'))!==registry.wavSHA256)throw Error('input SHA mismatch');
const sourceFiles=[];for(const relative of registry.sourcePaths)sourceFiles.push({path:relative,sha256:await sha(path.join(registry.sourceRoot,relative))});
const manifest={schema:'t1062-default-worker-prepared/v1',registry,sourceFiles,cacheRoot,cwd,modelCallsDuringPreparation:0,decodeCallsDuringPreparation:0};
await fs.writeFile(path.join(cwd,'package.json'),JSON.stringify({private:true}));
await fs.copyFile(path.join(dir,'bootstrap-template.cjs'),path.join(cwd,'creatoros-module-resolver.cjs'));
await fs.writeFile(path.join(dir,'prepared-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
try{await fs.symlink(registry.sourceRoot+'/ai-worker/node_modules',path.join(dir,'node_modules'));}catch(e){if(e.code!=='EEXIST')throw e;}
const req=createRequire(registry.sourceRoot+'/ai-worker/package.json'),{build}=req('esbuild');
await build({entryPoints:[path.join(dir,'run.mjs')],outfile:path.join(dir,'run.cjs'),bundle:true,platform:'node',target:'node24',format:'cjs',plugins:[piRuntimeInitializationPlugin()],external:['@xenova/transformers'],logLevel:'warning'});
const preparedSHA=await sha(path.join(dir,'prepared-manifest.json'));
const scripts=[];for(const name of ['registry.json','bootstrap-template.cjs','build.mjs','run.mjs','run.cjs'])scripts.push({path:path.join(dir,name),sha256:await sha(path.join(dir,name))});
await fs.writeFile(path.join(dir,'build-result.json'),JSON.stringify({status:'prepared_not_executed',preparedSHA,scripts,sourceFiles,modelCalls:0,decodeCalls:0},null,2)+'\n');
console.log(JSON.stringify({status:'prepared_not_executed',preparedSHA,modelCalls:0,decodeCalls:0,sourceFiles}));
