// T1300一次性项目数据迁移；不执行归档定义中的任何命令或路径。
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const rel='orchestrator/process/modules.config.json';
const original=readFileSync(resolve(root,rel));
const config=JSON.parse(original.toString('utf8'));
const ids=['T-1111','T-1125'];
const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,Object.keys(value).sort());
const proof=JSON.parse(readFileSync('docs/verification/t1300/workflow-preflight.json','utf8'));
assert.equal(sha(original),proof.sourceConfigSha256,'原配置已变，停止并重新核精确输入');
const lock=JSON.parse(readFileSync('docs/verification/t1300/SPEC_INPUT_LOCK.json','utf8'));
for(const [file,hash] of Object.entries(lock.inputs))assert.equal(sha(readFileSync(file)),hash,`已审输入漂移: ${file}`);
const events=readFileSync('orchestrator/events.ndjson','utf8').split(/\r?\n/).filter(Boolean);
const progress=JSON.parse(readFileSync('orchestrator/progress.json','utf8'));
const boards=['BACKLOG.md','BACKLOG-details.md','BACKLOG-archive.md'];
const entries={};
for(const id of ids){
 assert.ok(config.modules[id],`缺原模块: ${id}`);
 const matchingEvents=events.map((raw,index)=>({raw,line:index+1,event:JSON.parse(raw)})).filter(x=>x.event.task===id);
 const last=matchingEvents.at(-1);
 assert.equal(last?.event.action,'complete',`${id}最后事件非完成`);
 const previous=proof.candidates.find(x=>x.id===id);
 assert.equal(sha(last.raw),previous.lastEventRawSha256,`${id}终态锚已变`);
 const rows=[];
 for(const file of boards){
  const lines=readFileSync(file,'utf8').split(/\r?\n/);
  lines.forEach((row,index)=>{if(new RegExp(`^\\|\\s*${id}\\s*\\|`).test(row))rows.push({file,line:index+1,row});});
 }
 assert.equal(rows.length,1,`${id}canonical身份不唯一`);
 const cells=rows[0].row.split('|').slice(1,-1).map(x=>x.trim());
 assert.ok(cells[2]?.startsWith('✅'),`${id}看板非终态`);
 assert.equal((progress.verticals??[]).filter(x=>x.id===id||x.task_id===id).length,0,`${id}仍在派生执行队列`);
 assert.equal(Object.entries(progress.leases??{}).filter(([key,value])=>key.split(':')[0]===id||JSON.stringify(value).includes(id)).length,0,`${id}仍有lease`);
 const dependents=Object.entries(config.modules).filter(([other,value])=>other!==id&&JSON.stringify(value).includes(id));
 assert.equal(dependents.length,0,`${id}仍被现役module引用`);
 entries[id]={module:config.modules[id],originalModuleJSONSha256:sha(JSON.stringify(config.modules[id])),
  terminalEvent:{line:last.line,raw:last.raw,sha256:sha(last.raw)},canonicalRow:rows[0]};
}
const beforeModuleCount=Object.keys(config.modules).length;
const archivePath='orchestrator/process/modules.terminal-archive.json';
const snapshotPath='docs/verification/t1300/workflow/modules.before-archive.json';
assert.ok(!existsSync(archivePath),'归档已存在，不覆盖或重复迁移');
assert.ok(!existsSync(snapshotPath),'原配置快照已存在，不覆盖');
const archive={schema:'creatoros/terminal-module-archive@1',purpose:'只读历史项目定义；不是执行配置，不加载为module或命令',
 authorizedBy:'DEC-130001',reviewedSpecSha256:lock.inputs['docs/features/t1300-codex-functionality-and-performance.md'],
 migratedAt:new Date().toISOString(),source:{path:rel,snapshotPath,sha256:sha(original),bytes:original.length},archivedModules:entries};
for(const id of ids)delete config.modules[id];
const remainder=JSON.parse(original.toString('utf8'));
for(const id of ids)delete remainder.modules[id];
assert.deepEqual(config,remainder,'其他配置不得变化');
mkdirSync(dirname(snapshotPath),{recursive:true});
writeFileSync(snapshotPath,original,{flag:'wx'});
writeFileSync(archivePath,JSON.stringify(archive,null,2)+'\n',{flag:'wx'});
const temporary=`${rel}.tmp-${process.pid}`;
writeFileSync(temporary,JSON.stringify(config,null,2)+'\n',{flag:'wx'});
renameSync(temporary,rel);
const after=JSON.parse(readFileSync(rel,'utf8'));
assert.deepEqual(after,remainder);
assert.equal(sha(readFileSync(snapshotPath)),archive.source.sha256);
const guardPath='orchestrator/process/progress.mjs';
const result={schema:'t1300-terminal-module-migration/v1',archivedIds:ids,archivePath,snapshotPath,
 beforeModuleCount,afterModuleCount:Object.keys(after.modules).length,remainingModulesUnchanged:true,
 originalConfigSha256:sha(original),activeConfigSha256:sha(readFileSync(rel)),
 archiveSha256:sha(readFileSync(archivePath)),pathGuard:{path:guardPath,sha256:sha(readFileSync(guardPath)),modified:false},
 scope:'仅数据迁移；不等于progress/context-compile/安全负例已通过，不修改旧任务状态/审核/历史'};
writeFileSync('docs/verification/t1300/workflow/migration-result.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
