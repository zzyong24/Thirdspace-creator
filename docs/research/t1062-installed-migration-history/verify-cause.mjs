import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const r=JSON.parse(readFileSync(new URL('./cause-result.json',import.meta.url),'utf8'));
assert.equal(r.unknownIdentities.length,4);assert.equal(r.matchedGitSql.length,4);
for(const x of r.matchedGitSql){const raw=execFileSync('git',['cat-file','blob',x.oid]);assert.equal(createHash('sha256').update(raw).digest('hex'),x.sha256);assert.ok(r.unknownIdentities.some(i=>i.hash===x.sha256));}
assert.equal(r.knownCommonCount,101);assert.equal(r.backupContentAndStatUnchanged,true);assert.equal(r.actualDatabaseOpenedByProbe,false);
assert.deepEqual(r.catalogMissing,[]);assert.deepEqual(r.catalogExtras,[]);assert.equal(r.referenceConvergenceExecuted,true);
console.log('4/4精确历史SQL；101共同身份；隔离物理catalog匹配；原0128参考执行成功（非完整升级验收）');
