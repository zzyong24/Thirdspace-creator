#!/usr/bin/env node
// 复用T1355的冻结候选执行方式；只执行既有旅程，不生成PASS或修改报告。
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,existsSync,mkdtempSync,mkdirSync,writeFileSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=realpathSync(process.cwd()),task=process.argv[2];
const routes={'T-1370':'playwright.t1370.config.ts','T-1371':'playwright.t1371.config.ts'};assert(routes[task]);
const binding=JSON.parse(readFileSync(resolve(root,'docs/verification/t1370/control/FROZEN_CANDIDATE.json'),'utf8'));
assert.equal(binding.schema,'creatoros-frozen-ui-candidate/v1');assert.match(binding.commit,/^[a-f0-9]{40}$/);
const candidate=realpathSync(binding.path);assert.notEqual(candidate,root,'不得在foreign主树运行');
function git(cwd,args){const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
assert.equal(git(root,['rev-parse','HEAD']),binding.commit);assert.equal(git(candidate,['rev-parse','HEAD']),binding.commit);
assert.equal(realpathSync(resolve(root,git(root,['rev-parse','--git-common-dir']))),realpathSync(resolve(candidate,git(candidate,['rev-parse','--git-common-dir']))));
assert.equal(git(candidate,['status','--porcelain=v1']),'','候选源码不clean');assert(existsSync(resolve(candidate,'frontend',routes[task])));
const slug=task.toLowerCase().replace('-',''),privateParent=resolve(candidate,'docs/verification',slug,'private');mkdirSync(privateParent,{recursive:true,mode:0o700});
const output=mkdtempSync(join(privateParent,'strict-'));
const env={...process.env,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',PLAYWRIGHT_JSON_OUTPUT_FILE:join(output,'results.json')};
for(const name of ['T1355_FIXTURE_ROOT','T1356_FIXTURE_ROOT','T1371_FIXTURE_ROOT','DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'])delete env[name];
console.log(JSON.stringify({task,commit:binding.commit,candidate,output,controlledSyntheticIdentity:true,realPlatformLogin:false}));
const started=Date.now();
// 两test各7200秒+两server各600秒+两shutdown各120秒+独立cleanup240秒+余量120秒。
const result=spawnSync('pnpm',['--dir',resolve(candidate,'frontend'),'exec','playwright','test',`--config=${routes[task]}`,'--workers=1','--retries=0',`--output=${join(output,'artifacts')}`],{cwd:candidate,env,stdio:'inherit',timeout:16_200_000});
const fd=openSync(join(output,'EXIT.json'),'wx',0o600);writeFileSync(fd,JSON.stringify({task,childExit:result.status,signal:result.signal??null,spawnError:result.error?.code??null,seconds:(Date.now()-started)/1000})+'\n');fsyncSync(fd);closeSync(fd);
assert.equal(git(candidate,['rev-parse','HEAD']),binding.commit);assert.equal(git(candidate,['status','--porcelain=v1']),'','执行改动候选源码');
if(result.error)throw result.error;process.exit(result.status??1);
