#!/usr/bin/env node
// 执行已冻结候选的真实旅程，不生成PASS、不改报告。
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=realpathSync(process.cwd()),task=process.argv[2];
const routes={
 'T-1354':{config:'playwright.t1355.config.ts',family:'T1355'},
 'T-1355':{config:'playwright.t1355.config.ts',family:'T1355'},
 'T-1356':{config:'playwright.t1356.config.ts',family:'T1356'},
 'T-1361':{config:'playwright.t1361.config.ts',family:'T1361'},
 'T-1362':{config:'playwright.t1362.config.ts',family:'T1362'},
};
assert(routes[task],`未登记的冻结旅程：${task}`);
const binding=JSON.parse(readFileSync(resolve(root,'docs/verification/t1355/control/FROZEN_CANDIDATE.json'),'utf8'));
assert.equal(binding.schema,'creatoros-frozen-ui-candidate/v1');
assert.match(binding.commit,/^[a-f0-9]{40}$/);
const candidate=realpathSync(binding.path);assert.notEqual(candidate,root,'正式验收不得使用含foreign的主树');
function git(cwd,args){const result=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();}
assert.equal(git(root,['rev-parse','HEAD']),binding.commit,'控制HEAD变化，须重新冻结');
assert.equal(git(candidate,['rev-parse','HEAD']),binding.commit,'候选HEAD不匹配');
assert.equal(realpathSync(resolve(root,git(root,['rev-parse','--git-common-dir']))),realpathSync(resolve(candidate,git(candidate,['rev-parse','--git-common-dir']))),'候选不是本仓库managed worktree');
assert.equal(git(candidate,['status','--porcelain=v1']),'','候选源码存在变更');
assert(existsSync(resolve(candidate,'frontend',routes[task].config)),'缺少正式配置');
const env={...process.env,NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'};
// 每轮由配置生成全新独立根；不得继承旧库或任意上次连接。
for(const name of ['T1355_FIXTURE_ROOT','T1356_FIXTURE_ROOT','T1362_FIXTURE_ROOT','DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'])delete env[name];
console.log(JSON.stringify({task,commit:binding.commit,candidate,config:routes[task].config,startedAt:new Date().toISOString(),controlledSyntheticIdentity:true,realPlatformLogin:false}));
const result=spawnSync('pnpm',['--dir',resolve(candidate,'frontend'),'exec','playwright','test',`--config=${routes[task].config}`],{cwd:candidate,env,stdio:'inherit',timeout:15_600_000});
if(result.error)throw result.error;
assert.equal(git(candidate,['rev-parse','HEAD']),binding.commit,'执行期间候选HEAD变化');
assert.equal(git(candidate,['status','--porcelain=v1']),'','执行改动候选源码');
process.exit(result.status??1);
