// 项目自有只读证据检查；不冒称调用vendored私有validator，不写BACKLOG/event。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=fs.realpathSync(process.cwd());
const cardPath='docs/research/t1110-wechat-statistics-visible-section.md';
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=v=>createHash('sha256').update(v).digest('hex');
const sha=p=>hash(fs.readFileSync(path.join(root,p)));
const json=p=>JSON.parse(read(p));
const exists=p=>{assert.ok(typeof p==='string'&&p.length);const a=path.resolve(root,p);assert.ok(a.startsWith(root+path.sep));assert.ok(fs.existsSync(a));return a;};
const nonempty=s=>assert.ok(typeof s==='string'&&s.trim());
const events=()=>read('orchestrator/events.ndjson').trim().split('\n').map(JSON.parse);
const active=()=>{let open;for(const e of events())if(e.task==='T-1110'){if(e.action==='research_open')open=e;if(e.action==='research_resume')open=undefined;}assert.ok(open,'原研究OPEN缺失');return open;};
const parse=()=>{const text=read(cardPath);assert.ok(!text.includes('```research-first-gate/v1'));const m=text.match(/```research-first-gate\/v2\s*\n([\s\S]*?)\n```/);assert.ok(m);return JSON.parse(m[1]);};
const files=['BACKLOG.md','orchestrator/events.ndjson','orchestrator/DECISION_LOG.md','orchestrator/process/reconcile.config.json',cardPath,'tools/verification/t1110-research.mjs','tools/verification/t1110-scope-observe.sh','tools/verification/t1110-scope-check.mjs'];
const productionSources=['ai-worker/src/runtime/platform/wechat-browser-source.ts','ai-worker/src/runtime/platform/wechat-dom-witness.ts','ai-worker/src/runtime/platform/wechat-dom-witness.test.ts','frontend/src/server/persistence-client.ts'];
const inventory=card=>Object.fromEntries([...new Set([...files,...productionSources,...card.evidence.authoritative.filter(e=>!/^https?:\/\//.test(e.ref)).map(e=>e.ref),...card.evidence.local.map(e=>e.path),...card.evidence.experiments.map(e=>e.artifact_path),...card.validation.acceptance_criteria.map(e=>e.evidence_path)])].map(p=>[p,sha(p)]));
function boundary(){
 const c=parse();assert.equal(c.task_id,'T-1110');assert.equal(c.research_task_id,'T-1110');assert.equal(c.failure_family,'wechat-statistics-visible-section');assert.equal(c.evidence.experiments.length,2);assert.equal(c.validation.max_experiments,2);
 for(const e of c.evidence.experiments)assert.equal(sha(e.artifact_path),e.artifact_sha256);
 const e1=json('docs/verification/t1110/section-exp1-result.json'),e2=json('docs/verification/t1110/section-exp2-result.json');
 assert.equal(e1.actualPublicTerminal.status,'cancelled');assert.equal(e2.actualPublicTerminal.status,'failed');assert.equal(e1.actualPublicTerminal.committedPages,0);assert.equal(e2.actualPublicTerminal.committedPages,0);assert.equal(e2.rejectedSnapshot.pathCategory,'homepage');assert.equal(e2.rejectedSnapshot.snapshotPoint,'beforeCapture');assert.equal(e2.originalTaskPreserved.status,'failed');assert.equal(e2.originalTaskPreserved.committedPages,0);assert.equal(e2.publicReportsCount,0);
 const original=json('docs/verification/t1110/section-failure-20261010.json');assert.equal(original.attempt.attemptId,'collection-35c561b7-54');assert.equal(original.attempt.status,'failed');assert.equal(original.attempt.committedPages,0);assert.equal(sha('docs/verification/t1110/section-failure-20261010.json'),'8b29b3fee483689af8743df357f2e0aec21c76863ab532c1e077c4a53424825e');
 const status=json('docs/verification/t1110/product-live-status-20261009.json');assert.equal(status.latestPublicReportsCount,0);assert.equal(status.lastPublicResultObservedAt,'2026-10-09T17:23:42Z');
 const sourcePaths=['ai-worker/src/runtime/platform/wechat-browser-source.ts','ai-worker/src/runtime/platform/wechat-dom-witness.ts','ai-worker/src/runtime/platform/wechat-dom-witness.test.ts','frontend/src/server/persistence-client.ts'];
 for(const p of sourcePaths){const r=spawnSync('git',['show','69ac739d8e355037eb7e3a8a9e3eb1249dfd0361:'+p],{cwd:root,timeout:120000,maxBuffer:4*1024*1024});assert.equal(r.status,0);assert.equal(hash(r.stdout),sha(p),'生产源码不得提前改变: '+p);}
 const browser=read('tools/verification/t1110-scope-observe.sh');assert.ok(browser.includes('taskSpace(20)'));assert.ok(browser.includes("task.page('p6')"));assert.ok(browser.includes('timeout:120000'));assert.ok(browser.includes('timeout:150000'));assert.ok(browser.includes("task.ownership!=='agent'"));assert.ok(!/\.(goto|reload|click|newPage|fetch|handOff|close)\s*\(|document\.cookie|Storage|Cookie|Network\.|Browser\./.test(browser),'只读浏览器工具不得含副作用操作');
 const open=active();assert.equal(open.card,cardPath);assert.equal(open.research_task,'T-1110');assert.equal(open.failure_family,c.failure_family);assert.ok(c.trigger_kinds.includes(open.trigger_kind));assert.ok(/^\| T-1110 \|.*\| ⏸️ \|/m.test(read('BACKLOG.md')));
 return {result:'历史失败/2实验/原生产源与只读命令边界核对通过',historicalPublicReadAt:status.lastPublicResultObservedAt,currentPublicDatabaseRead:false,originalFailurePreserved:true,productionSourcePaths:sourcePaths,openSha256:hash(JSON.stringify(open))};
}
function full(){
 const c=parse(),open=active();
 assert.equal(c.schema,'research-first-gate/v2');assert.equal(c.status,'validated');assert.equal(c.task_id,'T-1110');assert.equal(c.research_task_id,open.research_task);assert.equal(open.card,cardPath);assert.equal(c.failure_family,open.failure_family);assert.ok(c.trigger_kinds.includes(open.trigger_kind));assert.match(c.failure_family,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);nonempty(c.problem_statement);nonempty(c.observed_invariant);
 const triggers=['repeated-failure-family','violated-invariant','high-cost-feedback-loop','unsuccessful-intervention-churn','external-capability-unknown','non-deterministic-behavior','high-impact-uncertainty'];assert.ok(c.trigger_kinds.length);for(const t of c.trigger_kinds)assert.ok(triggers.includes(t));
 for(const p of ['further-production-changes','broadened-workaround','repeated-full-system-runs','irreversible-operations'])assert.ok(c.paused_actions.includes(p));
 for(const k of ['authoritative','local','experiments'])assert.ok(c.evidence[k].length);
 for(const a of c.evidence.authoritative){assert.ok(['official-doc','standard','source-code','approved-spec'].includes(a.kind));nonempty(a.claim);if(!/^https?:\/\//.test(a.ref))exists(a.ref);}
 for(const e of c.evidence.local){exists(e.path);for(const k of ['kind','locator','observation'])nonempty(e[k]);}
 assert.ok(c.options.length>=2);for(const o of c.options)for(const k of ['id','outcome','tradeoffs','scope','falsified_by'])nonempty(o[k]);assert.ok(c.options.some(o=>o.id===c.recommendation));
 const v=c.validation;assert.ok(Number.isInteger(v.timebox_minutes)&&v.timebox_minutes>=1&&v.timebox_minutes<=240);assert.ok(Number.isInteger(v.max_experiments)&&v.max_experiments>=1&&v.max_experiments<=2);assert.ok(c.evidence.experiments.length<=v.max_experiments);assert.ok(v.acceptance_criteria.length>=2);nonempty(v.resume_criteria);
 const commands=json('orchestrator/process/reconcile.config.json').research_verify_commands;
 assert.equal(commands.t1110_wechat_section_mechanism,'zsh tools/verification/t1110-scope-observe.sh');assert.equal(commands.t1110_wechat_section_boundary,'node tools/verification/t1110-research.mjs boundary');
 const keys=new Set();for(const a of v.acceptance_criteria){for(const k of ['name','target','measurement','observed','verify_key'])nonempty(a[k]);exists(a.evidence_path);assert.match(a.evidence_sha256,/^[a-f0-9]{64}$/i);assert.equal(sha(a.evidence_path),a.evidence_sha256.toLowerCase());nonempty(commands[a.verify_key]);keys.add(a.verify_key);}
 assert.equal(keys.size,2);assert.deepEqual([...keys].sort(),['t1110_wechat_section_boundary','t1110_wechat_section_mechanism']);
 for(const e of c.evidence.experiments){for(const k of ['question','command','environment','result'])nonempty(e[k]);exists(e.artifact_path);assert.match(e.artifact_sha256,/^[a-f0-9]{64}$/i);assert.equal(sha(e.artifact_path),e.artifact_sha256);}
 const impacts=['product-direction','ia','data-ownership','security','data-contract','contract','release-criteria','irreversible-operation','material-cost'];assert.ok(c.decision_impacts.length);for(const i of c.decision_impacts)assert.ok(i==='none'||impacts.includes(i));if(c.decision_impacts.includes('none'))assert.equal(c.decision_impacts.length,1);
 // 当前仅DOM根的机械实现修复；有高影响改变时拒绝本专用入口，不能跳过用户DEC。
 assert.deepEqual(c.decision_impacts,['none']);assert.deepEqual(c.decision_ids,[]);
 const before=inventory(c),results=[];
 for(const key of keys){const command=commands[key];const r=spawnSync(command,{cwd:root,shell:'/bin/zsh',encoding:'utf8',timeout:240000,maxBuffer:1024*1024});assert.equal(r.status,0,'实际研究命令失败: '+key+'（不回显原始运行错误）');results.push({key,command,exitCode:r.status,stdout:r.stdout,stderr:r.stderr,outputSha256:hash(r.stdout+'\n'+r.stderr)});}
 assert.deepEqual(inventory(parse()),before,'验证期间输入漂移，不能登记CLOSE');assert.equal(hash(JSON.stringify(active())),hash(JSON.stringify(open)));
 return {schema:'t1110-project-independent-research-validation/v1',observedAt:new Date().toISOString(),root,method:'项目自有完整只读检查；未调用官方private validator或resume CLI',stateWrite:false,eventWrite:false,open,openSha256:hash(JSON.stringify(open)),inputSha256:before,results};
}
const mode=process.argv[2];assert.ok(['boundary','full-card'].includes(mode));console.log(JSON.stringify(mode==='boundary'?boundary():full(),null,2));
