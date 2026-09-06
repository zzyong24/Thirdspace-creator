import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,aiTasks,eq,type Db} from "@creatoros/backend";
import {createAiService,type ServiceDeps} from "./ai.service";
let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>{await close();});
function fixture(){
 const ctx={userId:"atomic-submission",accountId:`account-${++seq}`,requestId:"test",source:"ai" as const};
 const resolveTaskRuntimeData=vi.fn(async()=>({skillSnapshot:{revision:"first"}}));
 const service=createAiService({db,now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++seq}`,resolveTaskRuntimeData} as unknown as ServiceDeps);
 const input={taskType:"planning.thesis",attemptId:`atomic-task-attempt-${++seq}`,inputData:{projectId:"project",topic:"原主题"}};
 const binding={executionTaskId:"execution-parent",callId:`parent-call-${++seq}`,inputDigest:`sha256:${"a".repeat(64)}`};
 return {ctx,service,input,binding,resolveTaskRuntimeData};
}
it("原子准备不建任务，外层事务回滚同时撤销子任务",async()=>{
 const f=fixture();const prepared=await f.service.prepareTaskCommit(f.ctx,f.input);
 expect(await f.service.findTaskByAttempt(f.ctx,f.input.taskType,f.input.attemptId)).toBeNull();
 await expect(db.transaction(async tx=>{await prepared.commit(tx,f.binding);throw new Error("父回执写入失败");})).rejects.toThrow("父回执写入失败");
 expect(await f.service.findTaskByAttempt(f.ctx,f.input.taskType,f.input.attemptId)).toBeNull();
 const child=await db.transaction(tx=>prepared.commit(tx,f.binding));
 const [row]=await db.select().from(aiTasks).where(eq(aiTasks.id,child.id));
 expect(row!.runtimeData).toMatchObject({hostTaskSubmission:f.binding});expect(child).not.toHaveProperty("runtimeData");
 expect(f.resolveTaskRuntimeData).toHaveBeenCalledTimes(1);
});
it("相同来源重放返回原任务，不能接管公开提交或其他父调用",async()=>{
 const f=fixture(),prepared=await f.service.prepareTaskCommit(f.ctx,f.input);
 const child=await db.transaction(tx=>prepared.commit(tx,f.binding));
 expect((await db.transaction(tx=>prepared.commit(tx,f.binding))).id).toBe(child.id);
 await expect(db.transaction(tx=>prepared.commit(tx,{...f.binding,callId:"another-call"}))).rejects.toThrow("来源");
 const publicInput={...f.input,attemptId:f.input.attemptId+"-public"};
 const publicTask=await f.service.createTask(f.ctx,publicInput);
 const publicPrepared=await f.service.prepareTaskCommit(f.ctx,publicInput);
 await expect(db.transaction(tx=>publicPrepared.commit(tx,f.binding))).rejects.toThrow("来源");
 expect((await f.service.findTaskByAttempt(f.ctx,publicInput.taskType,publicInput.attemptId))!.id).toBe(publicTask.id);
});
it("准备期间及准备后修改外部输入，不改变账号、正文或冻结配置",async()=>{
 const f=fixture(),owner=structuredClone(f.ctx);let release!:()=>void;
 const gate=new Promise<void>(r=>{release=r;});const runtime={skillSnapshot:{revision:"original"}};
 f.resolveTaskRuntimeData.mockImplementation(async()=>{await gate;return runtime;});
 const work=f.service.prepareTaskCommit(f.ctx,f.input);
 f.ctx.accountId="changed";f.input.inputData.topic="changed";release();
 const prepared=await work;runtime.skillSnapshot.revision="changed";
 const task=await db.transaction(tx=>prepared.commit(tx,f.binding));
 expect(task.inputData).toMatchObject({topic:"原主题"});
 expect((await f.service.findTaskByAttempt(owner,f.input.taskType,f.input.attemptId))!.id).toBe(task.id);
 const [row]=await db.select().from(aiTasks).where(eq(aiTasks.id,task.id));expect(row!.runtimeData).toMatchObject({skillSnapshot:{revision:"original"}});
});
it("缺账号、无稳定键、保留字段或非法来源不进入持久写入",async()=>{
 const f=fixture();
 await expect(f.service.prepareTaskCommit({...f.ctx,accountId:null},f.input)).rejects.toThrow();
 await expect(f.service.prepareTaskCommit(f.ctx,{...f.input,attemptId:"short"})).rejects.toThrow();
 await expect(f.service.prepareTaskCommit(f.ctx,{...f.input,inputData:{skillSnapshot:{}}})).rejects.toThrow();
 expect(f.resolveTaskRuntimeData).not.toHaveBeenCalled();
 const prepared=await f.service.prepareTaskCommit(f.ctx,f.input);
 await expect(db.transaction(tx=>prepared.commit(tx,{...f.binding,inputDigest:"invalid"}))).rejects.toThrow();
 expect(await f.service.findTaskByAttempt(f.ctx,f.input.taskType,f.input.attemptId)).toBeNull();
});
