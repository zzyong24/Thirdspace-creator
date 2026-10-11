import {afterAll,beforeAll,expect,it} from 'vitest';
import {createDb,executionCalls,eq,type Db} from '@creatoros/backend';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionGenerationPorts} from './execution-generation-ports.service';
let db:Db,close:()=>Promise<void>,seq=0;
const now=()=> '2026-10-11T00:00:00Z',ctx={userId:'image-reserve-u',accountId:'image-reserve-a',requestId:'test',source:'user' as const},budget={maxCalls:4,maxTokens:100000,deadlineMs:120000};
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
async function fixture(maxOutputTokens=128,executionBudget=budget){
 const id=`image-reserve-${++seq}`,tasks=createPersistentTaskService(db,{now}),skillId='asset.classify';
 const modelInput={kind:'model.structured',operationKey:id,capability:skillId,maxOutputTokens,skillId,facets:{__assetProcessing:JSON.stringify({taskType:skillId,assetId:'owned-image',fileId:'owned-file',checksum:'original-checksum',fileName:'原用户图片.png',mimeType:'image/png',skipModel:false})},skillSnapshot:{snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:now(),platformPolicyVersion:'1',platformPolicy:'按原图片分类',skills:[{skillId,baseVersion:'1',overlayRevision:null,overlayVersion:null,effective:{methodSystem:'按原图片分类',template:'',tools:[],requiredFacets:[],contextRequirements:[],outputSchema:{type:'object'},completionPolicy:null,completionPolicyAdapter:null}}]}};
 const task=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:id,idempotencyKey:id,payload:{modelInput}}),claimed=(await tasks.claimTask({taskId:task.id,workerId:'worker'}))!,ref={executionTaskId:task.id,attempt:claimed.lease.attempt,fenceToken:claimed.lease.fenceToken};
 return {ref,id,ports:createExecutionGenerationPorts(db,{now,budget:executionBudget})};
}
it('asset.classify真实SDK7图片data envelope只预留视觉预算，不将base64传输长度计作文本token',async()=>{
 const f=await fixture(),request={operationKey:`${f.id}/model/1`,request:{maxOutputTokens:128,modelId:'codex-default',provider:'codex-app-server',prompt:[{role:'user',content:[{type:'file',mediaType:'image/png',data:{type:'data',data:Buffer.alloc(300000).toString('base64')}},{type:'text',text:'原授权分类'}]}]}};
 const receipt=await f.ports.reserveGenerationCall(f.ref,request);expect(receipt).toMatchObject({status:'reserved'});expect(await f.ports.reserveGenerationCall(f.ref,request)).toEqual(receipt);
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,receipt.callId));expect(call!.reservedTokens).toBeGreaterThan(65536);expect(call!.reservedTokens).toBeLessThan(70000);
 await expect(f.ports.reserveGenerationCall(f.ref,{...request,request:{...request.request,prompt:[{role:'user',content:[{type:'file',mediaType:'image/png',data:{type:'data',data:'different'}}]}]}})).rejects.toThrow('同一操作键');
});
it('真实探针同尺寸1.414MB图片与65536输出预算可入场，原冻结输出预算仍严格拒改',async()=>{
 const f=await fixture(65536,{maxCalls:6,maxTokens:1000000,deadlineMs:1800000}),request={operationKey:`${f.id}/model/1`,request:{maxOutputTokens:65536,provider:'codex-app-server',modelId:'codex-default',prompt:[{role:'user',content:[{type:'file',mediaType:'image/png',data:{type:'data',data:Buffer.alloc(1414662).toString('base64')}}]}]}};
 const receipt=await f.ports.reserveGenerationCall(f.ref,request);expect(receipt.status).toBe('reserved');
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,receipt.callId));expect(call!.reservedTokens).toBeLessThan(150000);
 await expect(f.ports.reserveGenerationCall(f.ref,{...request,request:{...request.request,maxOutputTokens:65535}})).rejects.toThrow('冻结值不符');
});
it('非图片文件仍按原输入计量，不能借SDK envelope绕过预算',async()=>{
 const f=await fixture();await expect(f.ports.reserveGenerationCall(f.ref,{operationKey:`${f.id}/model/1`,request:{maxOutputTokens:128,prompt:[{role:'user',content:[{type:'file',mediaType:'application/pdf',data:{type:'data',data:'x'.repeat(110000)}}]}]}})).rejects.toThrow('预算不足');
});
