import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,type Db} from "@creatoros/backend";
import {createAiService} from "./ai.service";
import {createAiTaskSubmissionService} from "./ai-task-submission.service";
let db:Db,close:()=>Promise<void>,seq=0;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});
afterAll(async()=>{await close();});
function fixture(){
 const context={userId:"submission-u",accountId:`account-${++seq}`,requestId:"r",source:"user" as const};
 // 本测试只使用真实任务 CRUD，采纳端口不会被调用。
 const service=createAiService({db,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-${++seq}`} as Parameters<typeof createAiService>[0]);
 const submit=vi.fn(service.createTask);
 const host=createAiTaskSubmissionService({findTaskByAttempt:service.findTaskByAttempt,submit});
 const request={taskType:"asset.generate",attemptId:`original-task-attempt-${++seq}`,inputData:{projectId:"p",prompt:"用户原意图"}};
 return {context,service,submit,host,request};
}
it("创建后响应丢失，修改稿件后恢复仍使用首次快照并走原派发入口",async()=>{
 const f=fixture();let lost=true;
 f.submit.mockImplementation(async(...args)=>{const task=await f.service.createTask(...args);if(lost){lost=false;throw new Error("response lost");}return task;});
 const prepareSnapshot=vi.fn(async()=>({scriptSnapshot:{text:"首次正文"}}));
 await expect(f.host.submit(f.context,f.request,{snapshotKeys:["scriptSnapshot"],prepareSnapshot})).rejects.toThrow("response lost");
 expect(f.submit).toHaveBeenCalledTimes(1);
 prepareSnapshot.mockResolvedValue({scriptSnapshot:{text:"后来改稿"}});
 const recovered=await f.host.submit(f.context,f.request,{snapshotKeys:["scriptSnapshot"],prepareSnapshot});
 expect(recovered.inputData).toMatchObject({scriptSnapshot:{text:"首次正文"}});expect(prepareSnapshot).toHaveBeenCalledTimes(1);expect(f.submit).toHaveBeenCalledTimes(2);
 expect((await f.service.listTasks(f.context,{limit:100,offset:0})).rows.map(task=>task.id)).toEqual([recovered.id]);
});
it("同次并发准备读到不同稿件，只接受第一个已保存任务",async()=>{
 const f=fixture();let arrivals=0,release!:()=>void;const ready=new Promise<void>(r=>{release=r;});
 const prepareSnapshot=vi.fn(async()=>{const version=++arrivals;if(arrivals===2)release();await ready;return {scriptSnapshot:{text:`稿件-${version}`}};});
 const options={snapshotKeys:["scriptSnapshot"],prepareSnapshot};
 const [a,b]=await Promise.all([f.host.submit(f.context,f.request,options),f.host.submit(f.context,f.request,options)]);
 expect(a.id).toBe(b.id);expect(a.inputData).toEqual(b.inputData);
 expect((await f.service.listTasks(f.context,{limit:100,offset:0})).rows).toHaveLength(1);
});
it("相同提交键修改或删除明确输入字段，不借首次快照掩盖另一个意图",async()=>{
 const f=fixture();await f.host.submit(f.context,f.request);
 for(const inputData of [{projectId:"p",prompt:"别的意图"},{prompt:"用户原意图"}])await expect(f.host.submit(f.context,{...f.request,inputData})).rejects.toMatchObject({code:"ATTEMPT_PAYLOAD_MISMATCH"});
 expect(f.submit).toHaveBeenCalledTimes(1);
});
it("未声明快照字段、用快照覆盖意图、准备期间取消均不提交",async()=>{
 const f=fixture();
 await expect(f.host.submit(f.context,f.request,{prepareSnapshot:async()=>({unexpected:true})})).rejects.toThrow("未声明");
 await expect(f.host.submit(f.context,f.request,{snapshotKeys:["projectId"]})).rejects.toThrow("同时属于");
 const controller=new AbortController();
 await expect(f.host.submit(f.context,f.request,{signal:controller.signal,prepareSnapshot:async()=>{controller.abort();return {};}})).rejects.toThrow();
 expect(f.submit).not.toHaveBeenCalled();
});

it("等待原任务查询期间调用方修改账号或输入，不改变快照归属",async()=>{
 const f=fixture(),owner=structuredClone(f.context);let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
 const host=createAiTaskSubmissionService({findTaskByAttempt:async(...args)=>{await gate;return f.service.findTaskByAttempt(...args);},submit:f.submit});
 const work=host.submit(f.context,f.request,{snapshotKeys:["scriptSnapshot"],prepareSnapshot:async(context,inputData)=>({scriptSnapshot:{accountId:context.accountId,projectId:inputData.projectId}})});
 f.context.accountId="changed";f.request.inputData.projectId="changed";release();
 const task=await work;
 expect(task.inputData).toMatchObject({projectId:"p",scriptSnapshot:{accountId:owner.accountId,projectId:"p"}});
 expect((await f.service.listTasks(owner,{limit:100,offset:0})).rows).toHaveLength(1);
});
