import {expect,it} from 'vitest';
import {scheduledFlywheelSnapshotSchema,scheduledFlywheelTaskInputSchema,workerSkillSnapshotSchema,structuredGenerationInputSchema,chatGenerationPreparationSchema,workerTaskInputSchema} from '../src/internal/execution-worker';
const empty={snapshotVersion:1,userId:'user',accountId:'account',resolvedAt:'2026-09-11T00:00:00.000Z',platformPolicyVersion:'1',platformPolicy:'policy',skills:[]};
const task={kind:'scheduled.flywheel',sourceKind:'self.traffic',jobId:'job',jobRunId:'run',target:{},skillSnapshot:empty};
it('只有明确self.traffic任务接受真实空snapshot，保留元信息和旧非空任务兼容',()=>{
 expect(scheduledFlywheelSnapshotSchema.parse({sourceKind:'self.traffic',skillSnapshot:empty}).skillSnapshot.skills).toEqual([]);
 expect(scheduledFlywheelTaskInputSchema.parse(task)).toEqual(task);expect(workerTaskInputSchema.parse(task)).toEqual(task);
 const populated={...empty,skills:[{skillId:'topic.attribution',baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'method',template:'template',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]};
 expect(scheduledFlywheelTaskInputSchema.safeParse({...task,skillSnapshot:populated}).success).toBe(true);
 for(const field of ['userId','accountId','platformPolicy'] as const)expect(scheduledFlywheelTaskInputSchema.safeParse({...task,skillSnapshot:{...empty,[field]:''}}).success).toBe(false);
});
it.each(['benchmark','self.detail','self.metrics','favorites'])('其他调度模型任务仍拒绝空snapshot：%s',sourceKind=>{
 expect(scheduledFlywheelSnapshotSchema.safeParse({sourceKind,skillSnapshot:empty}).success).toBe(false);
 expect(scheduledFlywheelTaskInputSchema.safeParse({...task,sourceKind}).success).toBe(false);
 expect(workerTaskInputSchema.safeParse({...task,sourceKind}).success).toBe(false);
});
it('结构化生成和聊天不能借traffic例外绕过冻结Skill，空snapshot仍失败',()=>{
 expect(workerSkillSnapshotSchema.safeParse(empty).success).toBe(false);
 expect(structuredGenerationInputSchema.safeParse({kind:'model.structured',operationKey:'op',capability:'review.insights',maxOutputTokens:100,skillId:'review.insights',skillSnapshot:empty,facets:{}}).success).toBe(false);
 expect(chatGenerationPreparationSchema.safeParse({node:{capability:'review.analyze',facets:{}},skillSnapshot:empty,maxOutputTokens:100,operationKey:'op'}).success).toBe(false);
});
