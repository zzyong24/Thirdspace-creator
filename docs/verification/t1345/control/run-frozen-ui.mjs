#!/usr/bin/env node
// 只选择并执行已冻结候选的真实旅程；本脚本不生成PASS或改验收报告。
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=realpathSync(process.cwd());
const task=process.argv[2];
const routes={
 'T-1345':{port:'3955',config:'playwright.t1345.config.ts'},
 'T-1346':{port:'3956',config:'playwright.t1346.config.ts'},
 'T-1347':{port:'41349',config:'../docs/verification/t1347/ui-playwright.config.mts'},
 'T-1348':{port:'3956',config:'playwright.t1346.config.ts'},
 'T-1350':{port:'3956',config:'playwright.t1346.config.ts'},
};
assert(routes[task],`未登记的冻结旅程：${task}`);
const binding=JSON.parse(readFileSync(resolve(root,'docs/verification/t1345/control/FROZEN_CANDIDATE.json'),'utf8'));
assert.equal(binding.schema,'creatoros-frozen-ui-candidate/v1');
assert.match(binding.commit,/^[a-f0-9]{40}$/);
const candidate=realpathSync(binding.path);assert.notEqual(candidate,root,'正式验收不得回到含foreign的主工作区');
function git(cwd,args){const r=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
assert.equal(git(root,['rev-parse','HEAD']),binding.commit,'控制HEAD已变化，须重新冻结/绑定');
assert.equal(git(candidate,['rev-parse','HEAD']),binding.commit,'候选HEAD不匹配');
assert.equal(realpathSync(resolve(root,git(root,['rev-parse','--git-common-dir']))),realpathSync(resolve(candidate,git(candidate,['rev-parse','--git-common-dir']))),'候选不是本仓库managed worktree');
assert.equal(git(candidate,['status','--porcelain=v1']),'','候选源码存在未提交/未跟踪改动');
assert(existsSync(resolve(candidate,'frontend',routes[task].config)),'冻结候选缺正式旅程配置');
const env={...process.env,CREATOROS_TEST_PORT:routes[task].port,CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL:'chrome',NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost'};
// 每次沿现主配置生成新的私有数据根；不继承任何上一次测试根。
delete env.CREATOROS_PLAYWRIGHT_DATA_ROOT;
if(task==='T-1347'){
 const seed=spawnSync('pnpm',['--dir',resolve(candidate,'backend'),'exec','tsx',resolve(candidate,'docs/verification/t1347/seed-native-fixture.mts')],{cwd:candidate,env,encoding:'utf8',timeout:300_000,maxBuffer:8*1024*1024});
 process.stdout.write(seed.stdout??'');process.stderr.write(seed.stderr??'');if(seed.error)throw seed.error;assert.equal(seed.status,0,'真实持久隔离种子未完成');
 const manifest=JSON.parse(seed.stdout);assert.equal(manifest.controlledSyntheticFacts,true);assert.equal(manifest.realPlatformCollection,false);assert.equal(manifest.runtimeIdentityResolved,true);env.T1347_FIXTURE_ROOT=manifest.root;env.T1347_UI_PORT=routes[task].port;
}
console.log(JSON.stringify({task,commit:binding.commit,candidate,config:routes[task].config,port:routes[task].port,startedAt:new Date().toISOString()}));
// 外层覆盖一例或两例既有7200000ms test budget、冷启动及独立清理余量。
const r=spawnSync('pnpm',['--dir',resolve(candidate,'frontend'),'exec','playwright','test',`--config=${routes[task].config}`],{cwd:candidate,env,stdio:'inherit',timeout:task==='T-1345'?8_040_000:15_180_000});
if(r.error)throw r.error;
assert.equal(git(candidate,['rev-parse','HEAD']),binding.commit,'旅程期间候选HEAD变化');
assert.equal(git(candidate,['status','--porcelain=v1']),'','旅程改动了候选源码');
process.exit(r.status??1);
