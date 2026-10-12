'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex'),toolRoot=__dirname,root=path.resolve(toolRoot,'../../../../..');
const targetedMode='targeted-pg-27';
function snapshot(workspace=root,mode='full-four-packages'){
 const manifest=JSON.parse(fs.readFileSync(path.join(toolRoot,'manifest.json'),'utf8'));
 const all=cp.execFileSync('rg',['--files',...(mode===targetedMode?['contract','ai-worker','backend']:['contract','ai-worker','backend','frontend'])],{cwd:workspace,encoding:'utf8',timeout:180000}).trim().split('\n');
 const isTest=file=>/\.(?:test|spec)\.[^/]+$/.test(file)||/(?:^|\/)(?:__tests__|tests|test-fixtures|fixtures)(?:\/|$)/.test(file);
 const files=new Set(all.filter(file=>{
  if(/(?:^|\/)(?:dist|\.next|node_modules|tests-t1246-generated|tests-t1246-settings-history-full)(?:\/|$)/.test(file))return false;
  if(mode!==targetedMode)return /\.(?:ts|tsx|js|mjs|cjs|sql|json)$/.test(file);
  if(/^(?:backend|contract|ai-worker)\/src\//.test(file))return !isTest(file);
  if(/^backend\/drizzle\//.test(file))return true;
  if(/^ai-worker\/vendor\//.test(file))return !isTest(file);
  return ['ai-worker/scripts/build.mjs','ai-worker/scripts/pi-runtime-bundle.mjs'].includes(file);
 }));
 for(const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml',...(mode===targetedMode?['contract','ai-worker','backend']:['contract','ai-worker','backend','frontend']).flatMap(pkg=>[pkg+'/package.json',pkg+'/vitest.config.ts',pkg+'/tsconfig.json']),...(mode===targetedMode?manifest.inputs.map(input=>input.file):[])])if(fs.existsSync(path.join(workspace,file)))files.add(file);
 const entries=[...files].sort().map(file=>({file,sha256:sha(fs.readFileSync(path.join(workspace,file)))}));
 const head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:workspace,encoding:'utf8',timeout:180000}).trim();
 return {workspace,head,mode,files:entries,sourceSnapshotDigest:sha(JSON.stringify(entries))};
}
function verify({mode='full-four-packages'}={}){
 if(![targetedMode,'full-four-packages'].includes(mode))throw Error('T1246_SOURCE_SCOPE_UNKNOWN');
 const m=JSON.parse(fs.readFileSync(path.join(toolRoot,'manifest.json'),'utf8'));const mismatches=[];
 for(const input of m.inputs){const file=path.join(root,input.file);if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==input.sha256)mismatches.push(input.file);}
 if(mismatches.length)throw Error('T1246_APPROVED_TOOL_SOURCE_DRIFT: '+mismatches.join(','));
 return {task:'T-1246',verifiedAt:new Date().toISOString(),candidate:m.originalCandidate,toolInputs:m.inputs.length,toolManifestSha256:sha(fs.readFileSync(path.join(toolRoot,'manifest.json'))),mismatches,pass:true,...snapshot(root,mode)};
}
module.exports={verify,snapshot,sha};
if(require.main===module){try{console.log(JSON.stringify(verify({mode:process.argv.includes('--targeted-pg')?targetedMode:'full-four-packages'}),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
