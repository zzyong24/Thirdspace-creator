'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex'),toolRoot=__dirname,root=path.resolve(toolRoot,'../../../../..');
function snapshot(workspace=root){
 const entries=cp.execFileSync('rg',['--files','contract','ai-worker','backend','frontend'],{cwd:workspace,encoding:'utf8',timeout:180000}).trim().split('\n').filter(file=>/\.(?:ts|tsx|js|mjs|cjs|sql|json)$/.test(file)&&!/(?:^|\/)(?:dist|\.next|node_modules|tests-t1246-generated|tests-t1246-settings-history-full)(?:\/|$)/.test(file)).sort().map(file=>({file,sha256:sha(fs.readFileSync(path.join(workspace,file)))}));
 for(const file of ['pnpm-lock.yaml','pnpm-workspace.yaml',...['contract','ai-worker','backend','frontend'].flatMap(pkg=>[pkg+'/package.json',pkg+'/vitest.config.ts',pkg+'/tsconfig.json'])])if(fs.existsSync(path.join(workspace,file)))entries.push({file,sha256:sha(fs.readFileSync(path.join(workspace,file)))});
 const head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:workspace,encoding:'utf8',timeout:180000}).trim();
 return {workspace,head,files:entries,sourceSnapshotDigest:sha(JSON.stringify(entries))};
}
function verify(){
 const m=JSON.parse(fs.readFileSync(path.join(toolRoot,'manifest.json'),'utf8'));const mismatches=[];
 for(const input of m.inputs){const file=path.join(root,input.file);if(!fs.existsSync(file)||sha(fs.readFileSync(file))!==input.sha256)mismatches.push(input.file);}
 if(mismatches.length)throw Error('T1246_APPROVED_TOOL_SOURCE_DRIFT: '+mismatches.join(','));
 return {task:'T-1246',verifiedAt:new Date().toISOString(),candidate:m.originalCandidate,toolInputs:m.inputs.length,toolManifestSha256:sha(fs.readFileSync(path.join(toolRoot,'manifest.json'))),mismatches,pass:true,...snapshot()};
}
module.exports={verify,snapshot,sha};
if(require.main===module){try{console.log(JSON.stringify(verify(),null,2));}catch(error){console.error(error.message);process.exitCode=1;}}
