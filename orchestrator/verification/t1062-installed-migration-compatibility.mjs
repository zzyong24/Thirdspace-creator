// 校验已经现场执行的源码/回执绑定；不重复运行已通过的相同测试，也不代签安装版。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const i=process.argv.indexOf('--evidence-root');
assert.ok(i>=0&&process.argv[i+1],'必须显式指定实际私有回执目录 --evidence-root');
const evidence=path.resolve(process.argv[i+1]);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(path.join(evidence,name),'utf8'));
const receipt=read('actual-test-and-clone-receipt.json');
assert.equal(receipt.testExit,0);assert.equal(receipt.testsPassed,21);assert.equal(receipt.cloneGreenExit,0);
for(const [name,key]of [
 ['candidate-migration-tests.stdout','stdoutSha256'],['candidate-migration-tests.stderr','stderrSha256'],
 ['actual-candidate-source-observed-during-tests.json','sourceObservationSha256'],
 ['public-factory-green-result.json','cloneGreenSha256'],['public-factory-red-result.json','redPublicFactorySha256']
])assert.equal(sha(fs.readFileSync(path.join(evidence,name))),receipt[key],`${name} 回执漂移`);
assert.match(fs.readFileSync(path.join(evidence,'candidate-migration-tests.stdout'),'utf8'),/21 passed \(21\)/);
const bindings=read('actual-candidate-source-observed-during-tests.json');
assert.equal(bindings.identity,'ACTUAL_DURING_EXECUTION_SOURCE_OBSERVATION_NOT_PRE_RUN_CLAIM');
assert.equal(bindings.bindings.length,281);
for(const item of bindings.bindings){
 const f=path.resolve(root,item.path);assert.ok(f.startsWith(root+path.sep));
 assert.equal(sha(fs.readFileSync(f)),item.sha256,item.path+' 不再匹配实际执行源码');
 assert.equal(fs.statSync(f).mode,item.mode);
}
const original=read('frozen-original-before.json');assert.equal(original.length,361);
for(const item of original){assert.equal(sha(fs.readFileSync(path.join(root,item.path))),item.sha256);assert.equal(fs.statSync(path.join(root,item.path)).mode,item.mode);}
const sources=JSON.parse(fs.readFileSync(path.join(root,'backend/src/migration-convergence-installed-lineages.json'),'utf8'));
let frozenSql=0;
for(const [name,source]of Object.entries(sources)){
 const directory=path.join(root,'backend/drizzle/lineages',name);
 const originalJournal=execFileSync('git',['show',source.ref+':backend/drizzle/meta/_journal.json'],{cwd:root});
 assert.equal(sha(originalJournal),source.journalSha256);
 assert.deepEqual(fs.readFileSync(path.join(directory,'meta/_journal.json')),originalJournal);
 for(const item of source.entries){
  const originalSql=execFileSync('git',['show',source.ref+':backend/drizzle/'+item.tag+'.sql'],{cwd:root});
  assert.equal(sha(originalSql),item.hash);assert.deepEqual(fs.readFileSync(path.join(directory,item.tag+'.sql')),originalSql);frozenSql++;
 }
}
assert.equal(frozenSql,274);
const red=read('public-factory-red-result.json');assert.equal(red.expectedUnknownMigration,true);
const green=read('public-factory-green-result.json');
assert.equal(green.status,'ACTUAL_PUBLIC_FACTORY_CLONE_UPGRADE_TWO_STARTS_PASSED');
assert.equal(green.originalTables,132);assert.equal(green.originalLedgerCount,105);assert.equal(green.newLedgerCount,106);
for(const key of ['allOriginalTableCountsAndProjectedRowDigestsEqual','originalLedgerIdsHashesTimesPreserved','secondStartExactSnapshotEqual'])assert.equal(green[key],true);
assert.equal(read('backup-db-after-public-upgrade.json').immutableBackupContentModeSizeMtimeLinksUnchanged,true);
execFileSync('git',['diff','--check'],{cwd:root});
const result={schema:'t1062-installed-history-compatibility@1',status:'ACTUAL_TEST_AND_CLONE_EVIDENCE_VERIFIED',
 observedAt:new Date().toISOString(),headAtEvidenceCheck:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
 sourceBindingIdentity:bindings.identity,sourceObservationSha256:receipt.sourceObservationSha256,actualRunReceiptSha256:sha(fs.readFileSync(path.join(evidence,'actual-test-and-clone-receipt.json'))),
 testsPassed:21,frozenSqlVerified:274,originalBoundariesUnchanged:361,cloneOriginalTables:132,cloneOldLedgerPreserved:105,cloneNewRealReceipts:1,cloneSecondStartEqual:true,
 installedFunctionalAcceptance:'NOT_YET_REBUILT_OR_INSTALLED',globalTypecheck:'BASELINE_AND_CANDIDATE_SAME_EXISTING_TS2322',
 bindingNote:'测试在未提交工作树实际执行；当前字节逐项匹配现场观察，不追认历史HEAD或安装版通过'};
fs.writeFileSync(path.join(root,'docs/verification/t1062/installed-migration-compatibility-result.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
