import assert from 'node:assert/strict';
import fs from 'node:fs';
const frozen=JSON.parse(fs.readFileSync('docs/verification/evidence/t1032/frozen-task-context.json','utf8'));
const metadata=JSON.parse(fs.readFileSync('docs/verification/evidence/t1032/generation-metadata.json','utf8'));
assert.equal(frozen.tasks.length,3);
for(const [index,task] of frozen.tasks.entries()){
 assert.equal(task.initialVoiceoverInspectionComplete,true);
 assert.equal(task.initialVoiceoverPresent,false);
 const compose=task.skills.find(s=>s.skillId==='script.voiceover.compose');
 assert.ok(compose);
 assert.equal(compose.overlayVersion,null);
 if(index>0)assert.equal(compose.factScopeInFrozenSystem,true);
 const matching=metadata.tasks.find(t=>t.taskId===task.taskId);
 assert.equal(matching.results.length,1);
 const result=matching.results[0];
 assert.equal(result.generationPipeline,'voiceover_storyboard_v1');
 assert.equal(result.generationAttempts.length,2);
 assert.ok(result.generationSkills.some(s=>s.skillId==='script.voiceover.compose'&&s.baseVersion===compose.baseVersion));
}
console.log('三轮新口播、冻结版本与调用阶段证据一致；不验证事实准确性。');
