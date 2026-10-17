import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createDb,aiTasks,aiTaskSteps,executionTasks,eq,type Db} from '@creatoros/backend';
import {createTranscribeBusinessExecutionService} from './transcribe-business-execution.service';
let db:Db,close:()=>Promise<void>,seq=0;
const ctx={userId:'transcribe-prepare',accountId:'transcribe-prepare',requestId:'fixture',source:'user' as const},budget={maxCalls:5,maxTokens:1000,deadlineMs:60000};
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
async function fixture(patch:Partial<typeof aiTasks.$inferInsert>={}){
 const id=`transcribe-prep-${++seq}`;await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'transcribe.douyin',idempotencyKey:id,inputData:{awemeIds:['one','two']},requestedAt:new Date().toISOString(),requestFingerprint:'sha256:'+'a'.repeat(64),...patch});
 const resolveSpec=vi.fn(async()=>({kind:'audio' as const,provider:'qwen',model:'asr',baseUrl:null,token:'private-token',settings:{maxBytes:1000,secret:'must-not-persist'}}));
 return {id,resolveSpec,service:createTranscribeBusinessExecutionService(db,{budget,resolveSpec})};
}
it('任务冻结无密钥配置，重复准备复用同一执行且不重读配置',async()=>{
 const f=await fixture(),first=await f.service.prepare(ctx,f.id),second=await f.service.prepare(ctx,f.id);expect(first).toEqual(second);expect(f.resolveSpec).toHaveBeenCalledTimes(1);expect(f.resolveSpec).toHaveBeenCalledWith(ctx,{aiTaskId:f.id},expect.any(AbortSignal));
 const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,first.executionTaskId!));expect(row!.payload).toMatchObject({modelInput:{kind:'transcribe.douyin',awemeIds:['one','two'],language:'zh',configuration:{provider:'qwen',settings:{maxBytes:1000}}}});expect(JSON.stringify(row)).not.toContain('private-token');expect(JSON.stringify(row)).not.toContain('must-not-persist');
});
it('配置等待期间取消不创建执行',async()=>{
 const f=await fixture(),controller=new AbortController();f.resolveSpec.mockImplementation(async()=>{controller.abort();return {kind:'audio',provider:'qwen',model:'asr',baseUrl:null,token:'private-token',settings:{maxBytes:1000,secret:''}};});
 await expect(f.service.prepare(ctx,f.id,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]?.executionTaskId).toBeNull();
});
it('旧任务步骤和重试来源不换新账本',async()=>{
 for(const variant of ['step','retry']){const f=await fixture(variant==='retry'?{retryOfTaskId:'old'}:{});if(variant==='step')await db.insert(aiTaskSteps).values({id:`step-${f.id}`,aiTaskId:f.id,stepNo:1,kind:'transcribe',text:'已执行',createdAt:new Date().toISOString()});expect(await f.service.prepare(ctx,f.id)).toEqual({legacy:true});expect(f.resolveSpec).not.toHaveBeenCalled();}
});
it('准备期间作品输入变化不能提交旧配置，跨账号拒绝',async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(aiTasks).set({inputData:{awemeIds:['changed']}}).where(eq(aiTasks.id,f.id));return {kind:'audio',provider:'qwen',model:'asr',baseUrl:null,token:'',settings:{maxBytes:1000,secret:''}};});
 await expect(f.service.prepare(ctx,f.id)).rejects.toThrow();await expect(f.service.prepare({...ctx,accountId:'other'},f.id)).rejects.toThrow();
});

it('转写实际prepare把取消传给官方fresh，迟到结果不创建执行',async()=>{
 const f=await fixture(),controller=new AbortController();let seen:AbortSignal|undefined,entered!:()=>void,release!:()=>void;
 const atNetwork=new Promise<void>(r=>{entered=r}),gate=new Promise<void>(r=>{release=r});
 const service=createTranscribeBusinessExecutionService(db,{budget,resolveSpec:async(_ctx,_owner,signal)=>{seen=signal;entered();await gate;signal?.throwIfAborted();return{kind:'audio',provider:'qwen',model:'asr',baseUrl:null,token:'synthetic',settings:{}};}});
 const work=service.prepare(ctx,f.id,controller.signal),settled=Promise.allSettled([work]);await atNetwork;
 try{expect(seen).toBeInstanceOf(AbortSignal);}finally{controller.abort();release();await settled;}
 expect(seen?.aborted).toBe(true);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]?.executionTaskId).toBeNull();
});
