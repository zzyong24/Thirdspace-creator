import {it,expect} from 'vitest';
import {workEditorReadInput,workEditorProposeInput} from '../src/resources/work-editor';
import {ENDPOINTS} from '../src/endpoints';
import {getCliOperationPolicy} from '../src/cli-policy';
const hash='sha256:'+ 'a'.repeat(64),base={kind:'production',productionId:'production',revision:1};
const candidate={kind:'markdown_timeline',owner:'production',sceneId:'scene',markdown:'<!-- body -->',declaredTrackIds:['main'],stateStamp:hash,libraryStamp:hash};
it('真实script_markdown读取视图与严格候选字段可用，不能注入归属或猜stamp',()=>{
 expect(workEditorReadInput.parse({view:'script_markdown'}).view).toBe('script_markdown');
 expect(workEditorProposeInput.parse({base,baseDigest:hash,summary:'明确删留',candidate}).candidate.kind).toBe('markdown_timeline');
 expect(workEditorProposeInput.safeParse({base,baseDigest:hash,summary:'bad',candidate:{...candidate,groupId:'foreign'}}).success).toBe(false);
 expect(workEditorProposeInput.safeParse({base,baseDigest:hash,summary:'bad',candidate:{...candidate,stateStamp:'invented'}}).success).toBe(false);
});
it('两个公开包装都没有正式领域写副作用，现有采纳仍是唯一写入口',()=>{
 expect(ENDPOINTS.readProductionEditorScript.id).toBe('outputs.production.editor.script.read');
 expect(ENDPOINTS.proposeProductionEditorScript.id).toBe('outputs.production.editor.script.propose');
 expect(getCliOperationPolicy(ENDPOINTS.readProductionEditorScript.id)!.effect).toBe('read');
 expect(getCliOperationPolicy(ENDPOINTS.proposeProductionEditorScript.id)!.effect).toBe('read');
});
