import fs from 'node:fs';
import assert from 'node:assert/strict';
const stdout=fs.readFileSync(process.argv[2],'utf8');
const lines=stdout.split('\n');const line=lines.find(line=>line.startsWith('{"observedAt"'));
assert.ok(line,'未收到有效只读观察结果（不回显原始运行错误）');const observation=JSON.parse(line);const v=observation.value;
assert.equal(v.officialOrigin,true);assert.equal(v.path,'/platform/statistic/post');assert.equal(v.readyState,'complete');assert.equal(v.visibleWujieHosts,1);assert.equal(v.shadowMode,'open');
assert.deepEqual(v.shadowCounts,[1,1,1]);assert.deepEqual(v.shadowVisibleCounts,[1,1,1]);assert.equal(v.frames.length,1);assert.equal(v.frames[0].visible,false);assert.equal(v.frames[0].display,'none');assert.deepEqual(v.frames[0].nativeCounts,[0,0,0]);assert.deepEqual(v.frames[0].proxyCounts,[1,1,1]);assert.equal(v.frames[0].nativeBodyLength,0);assert.ok(v.frames[0].proxyBodyLength>0);assert.equal(v.frames[0].proxyLabelsBelongToVisibleShadow,true);assert.equal(v.frames[0].nativeLabelRootMatchesVisibleShadow,true);

console.log(JSON.stringify(observation,null,2));
