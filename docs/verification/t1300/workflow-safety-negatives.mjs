import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.cwd(),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'t1300-path-negatives-'));
const fixture=path.join(temporary,'fixture'),proc=path.join(fixture,'orchestrator/process');fs.mkdirSync(proc,{recursive:true});
const results=[];let cleaned=false;
try{
 for(const name of fs.readdirSync('orchestrator/process').filter(x=>x.endsWith('.mjs')))fs.copyFileSync(path.join('orchestrator/process',name),path.join(proc,name));
 fs.writeFileSync(path.join(proc,'reconcile.config.json'),JSON.stringify({execution_mode:'interactive',autonomy_level:'interactive'}));
 const module={tasks:['work'],write_set:['src/safe.ts'],read_set:[]};
 const generate=pattern=>{
  fs.writeFileSync(path.join(proc,'modules.config.json'),JSON.stringify({modules:{safe:{...module,write_set:[pattern]}}}));
  return spawnSync(process.execPath,[path.join(proc,'progress.mjs'),'generate'],{cwd:fixture,encoding:'utf8'});
 };
 const positive=generate('src/safe.ts');assert.equal(positive.status,0,positive.stderr);results.push({case:'exact-repo-file',exit:positive.status,expected:'allowed'});
 for(const [name,pattern] of [['unix-absolute','/tmp/escape.ts'],['windows-absolute','C:\\escape.ts'],['parent-traversal','../escape.ts'],['embedded-traversal','src/../escape.ts'],['tail-star','docs/file*'],['middle-glob','src/*/file.ts'],['nonterminal-recursive','src/**/file.ts']]){
  const r=generate(pattern);assert.equal(r.status,2,name);assert.match(r.stderr,/safe repo-relative/);results.push({case:name,pattern,exit:r.status,expected:'rejected',diagnostic:r.stderr.trim()});
 }
 const outside=path.join(temporary,'outside.md');fs.writeFileSync(outside,'# Only an external fixture\n');
 fs.mkdirSync(path.join(fixture,'docs'));fs.symlinkSync(outside,path.join(fixture,'docs/escape.md'));
 // macOS临时目录可能经/var别名；原CLI以真实SELF判断入口，传真实脚本路径才确实执行main。
 const link=spawnSync(process.execPath,[fs.realpathSync(path.join(proc,'governance-guard.mjs')),'baseline-marker','--root',fixture,'--task','T-TEST','--file','docs/escape.md','--reason','negative fixture'],{encoding:'utf8'});
 assert.equal(link.status,2);assert.match(link.stderr,/path escape rejected/);results.push({case:'symlink-outside-project',exit:link.status,expected:'rejected',diagnostic:link.stderr.trim(),scope:'既有governance源路径真实realpath边界；没有baseline-apply或库外写'});
}finally{fs.rmSync(temporary,{recursive:true,force:true});cleaned=true;}
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const output={schema:'t1300-original-path-guard-negatives/v1',results,temporaryRemoved:cleaned,sourceGuardsModified:false,
 guardHashes:{progress:hash('orchestrator/process/progress.mjs'),governance:hash('orchestrator/process/governance-guard.mjs')},
 reservedControlPaths:'原57例完整环境化验证中candidate validation reserved control path负例PASS，未改其源码/断言'};
fs.writeFileSync('docs/verification/t1300/workflow/safety-negatives.json',JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({cases:results.length,pass:results.length,temporaryRemoved:cleaned}));
