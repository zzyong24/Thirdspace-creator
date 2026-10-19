// Preparation template only: may run only after ROOT supplies approved exact source SHAs.
import fs from 'node:fs/promises';
import {createReadStream,constants} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {piRuntimeInitializationPlugin} from '/Users/zyongzhu/.codex/worktrees/t1062-migration-convergence/Thirdspace-creator/ai-worker/scripts/pi-runtime-bundle.mjs';
const dir='/tmp/t1062-default-worker-preflight';
const sha=async file=>{const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');};
const approvalPath=path.join(dir,'root-r3-reviewed-sources.json');
const approval=JSON.parse(await fs.readFile(approvalPath,'utf8'));
if(approval.buildAuthorized!==true||approval.sourceRoot!=='/Users/zyongzhu/.codex/worktrees/t1062-migration-convergence/Thirdspace-creator'||!Array.isArray(approval.sourceFiles))throw Error('ROOT reviewed source SHA authorization missing');
const prior=JSON.parse(await fs.readFile(path.join(dir,'prepared-manifest-r2.json'),'utf8'));
if(approval.sourceFiles.length!==prior.sourceFiles.length||prior.sourceFiles.some(f=>!approval.sourceFiles.some(a=>a.path===f.path&&typeof a.sha256==='string'&&/^[a-f0-9]{64}$/.test(a.sha256))))throw Error('ROOT exact complete source list required');
for(const file of approval.sourceFiles)if(await sha(path.join(approval.sourceRoot,file.path))!==file.sha256)throw Error('ROOT reviewed source changed: '+file.path);
const output=path.join(dir,'run-three'),cacheRoot=path.join(output,'cache'),cwd=path.join(output,'runtime','frontend');
await fs.mkdir(cwd,{recursive:true});
for(const f of prior.registry.modelFiles){const source=path.join(prior.registry.originDirectory,f.path),target=path.join(cacheRoot,f.path);if(await sha(source)!==f.sha256)throw Error('original model SHA changed');await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(source,target,constants.COPYFILE_EXCL);if(await sha(target)!==f.sha256)throw Error('fresh independent cache copy SHA mismatch');}
if(await sha(path.join(prior.registry.originDirectory,'audio.wav'))!==prior.registry.wavSHA256)throw Error('original WAV SHA changed');
await fs.writeFile(path.join(cwd,'package.json'),JSON.stringify({private:true}),{flag:'wx'});
await fs.copyFile(path.join(dir,'bootstrap-r3-template.cjs'),path.join(cwd,'creatoros-module-resolver.cjs'),constants.COPYFILE_EXCL);
const manifest={...prior,registry:{...prior.registry,observedHead:approval.observedHead,sourceSHAApproval:'ROOT frozen Reflect.apply revision; model execution pending'},harnessRevision:'r3-canonical-path-transparent-error-observation',sourceFiles:approval.sourceFiles,rootReviewedSourcesSHA256:await sha(approvalPath),priorPreparedManifestSHA256:await sha(path.join(dir,'prepared-manifest-r2.json')),priorFailureEvidenceSHA256:await sha(path.join(dir,'execution-evidence-r2.json')),cacheRoot,cwd};
await fs.writeFile(path.join(dir,'prepared-manifest-r3.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
const req=createRequire(approval.sourceRoot+'/ai-worker/package.json'),{build}=req('esbuild');
await build({entryPoints:[path.join(dir,'run-r3.mjs')],outfile:path.join(dir,'run-r3.cjs'),bundle:true,platform:'node',target:'node24',format:'cjs',plugins:[piRuntimeInitializationPlugin()],external:['@xenova/transformers'],logLevel:'warning'});
const names=['run-r3.mjs','run-r3.cjs','build-r3.mjs','bootstrap-r3-template.cjs','prepared-manifest-r3.json'];
const artifacts=[];for(const name of names)artifacts.push({path:path.join(dir,name),sha256:await sha(path.join(dir,name))});
const record={status:'r3_prepared_not_executed',modelCalls:0,decodeCalls:0,buildTarget:'node24',runtimeVersion:process.version,execPath:process.execPath,preparedManifestSHA256:await sha(path.join(dir,'prepared-manifest-r3.json')),sourceFiles:manifest.sourceFiles,artifacts};
await fs.writeFile(path.join(dir,'build-r3-result.json'),JSON.stringify(record,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(record));
