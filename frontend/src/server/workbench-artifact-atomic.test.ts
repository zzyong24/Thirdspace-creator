// @vitest-environment node
import {afterAll,beforeAll,expect,it} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import {createDb,eq,executionCalls,executionTasks,workbenchArtifactLineageVersions,type Db} from "@creatoros/backend";
import {createAiRepository,createChatTurnSubmissionService} from "@creatoros/backend/modules/ai";
import {createPersistentTaskService,createWorkbenchArtifactReadService,createWorkbenchArtifactService,startWorkbenchArtifactReconciler,type WorkbenchArtifactBlobPort} from "@creatoros/backend/modules/execution";
import {agenticToolOperationKey} from "../../../backend/src/modules/execution/agentic-tool-binding";
import {workbenchArtifactSchema} from "@creatoros/contract/agent-workbench";
import {agenticToolOutcomeSchema,workbenchToolOutcome} from "@creatoros/contract/execution-worker";
import {createWorkbenchArtifactHost} from "./workbench-artifact-host";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());

// 真实聊天提交、租约、模型工具绑定账本、宿主和原子提交；仅文件/Blob I/O 使用隔离内存端口。
async function fixture(html=true){
 const nonce=randomUUID(),ctx={userId:`atomic-u-${nonce}`,accountId:`atomic-a-${nonce}`,requestId:nonce,source:"user" as const};
 const repo=createAiRepository(db,{...ctx,now:()=>new Date().toISOString(),nextId:prefix=>`${prefix}-${randomUUID()}`});
 const conversation=await repo.createConversation({title:"诊断原子结算",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"产物测试",attachments:[],modelMetadata:{}});
 const submitted=await createChatTurnSubmissionService(db,{assemble:async()=>({capability:"copilot.assist",system:"测试",messages:[{role:"user",content:"产物测试"}],tools:[],maxSteps:4,maxOutputTokens:128})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id});
 const taskId=submitted.executionTaskId;
 const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,taskId));
 const payload=task!.payload as Record<string,unknown>;
 await db.update(executionTasks).set({payload:{...payload,modelInput:{...payload.modelInput as object,tools:[{name:"artifact.register"}]}}}).where(eq(executionTasks.id,taskId));
 const workerId=`worker-${nonce}`,claim=(await createPersistentTaskService(db).claimTask({taskId,workerId}))!;
 const operationId=randomUUID(),claimId=randomUUID(),modelId=randomUUID(),toolCallId=randomUUID(),stamp=new Date().toISOString();
 await db.insert(executionCalls).values({id:modelId,executionTaskId:taskId,sequence:1,operationKey:`model:${modelId}`,kind:"model",inputDigest:`sha256:${"b".repeat(64)}`,status:"settled",reservedTokens:1,accountingBasis:"tokens",startedAttempt:claim.lease.attempt,usage:{totalTokens:1},totalTokens:1,
  providerResult:{content:[{type:"tool-call",toolCallId,toolName:"artifact_register",input:"{}"}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:1},outputTokens:{total:0}},warnings:[]},createdAt:stamp,updatedAt:stamp});
 await db.insert(executionCalls).values({id:operationId,executionTaskId:taskId,sequence:2,operationKey:agenticToolOperationKey(modelId,toolCallId),kind:"tool",inputDigest:`sha256:${"a".repeat(64)}`,status:"started",reservedTokens:0,accountingBasis:"tokens",startedAttempt:claim.lease.attempt,toolExecutionClaimId:claimId,createdAt:stamp,updatedAt:stamp});
 const bytes=Buffer.from(html?'<p>数据 42</p><script src="https://cdn.example/echarts.js"></script><script>draw()</script>':"测试正文"),objects=new Map<string,Uint8Array>();
 const key=(input:{taskId:string;operationId:string;hash:string})=>JSON.stringify([input.taskId,input.operationId,input.hash]);
 const blobs:WorkbenchArtifactBlobPort={
  async submit(_ctx,input){const hash=createHash("sha256").update(input.bytes).digest("hex");objects.set(key({...input,hash}),new Uint8Array(input.bytes));return {hash,size:input.bytes.length};},
  async read(_ctx,input){
   // 与正式存储设置读取一样先走根 db，防止原子提交把 Blob 回读放进独占事务。
   await db.select({id:executionTasks.id}).from(executionTasks).limit(1);
   const value=objects.get(key(input));if(!value)throw Error("MISSING_BLOB");return new Uint8Array(value);
  },
 };
 const host=createWorkbenchArtifactHost(db,{platform:"darwin",desktop:true,socketPath:"isolated-test.sock",blobs,
  filePort:async(_ref,_operationId,action)=>{
   if(action.kind==="stat")return {isDirectory:false,size:bytes.length,version:1};
   if(action.kind==="read")return {contentBase64:bytes.subarray(action.offset,action.offset+action.limit).toString("base64"),total:bytes.length,version:1};
   throw Error("UNEXPECTED_FILE_ACTION");
  }})!;
 const call={context:{userId:ctx.userId,accountId:ctx.accountId,taskId,operationId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:workerId},invocation:{name:"artifact.register",schemaVersion:1 as const,input:{path:html?"报告.html":"报告.md",mime:html?"text/html":"text/markdown"}}};
 const registered=await host.dispatch(call,{signal:new AbortController().signal,onProgress:()=>{}});
 expect(registered.status).toBe("succeeded");if(registered.status!=="succeeded")throw Error(JSON.stringify(registered));
 expect(registered.content).toHaveLength(2);
 const first=registered.content[0]!;if(first.type!=="text")throw Error("MISSING_METADATA");
 const metadata=workbenchArtifactSchema.parse(JSON.parse(first.text));
 const outcome=workbenchToolOutcome(registered,host.catalog.find(tool=>tool.name==="artifact.register")!);
 const commit=async(value:unknown=outcome)=>host.commitAndSettle!(call,{claimId,toolCallId,outcome:agenticToolOutcomeSchema.parse(value)});
 return {ctx,conversation,taskId,operationId,claimId,toolCallId,call,host,bytes,blobs,metadata,outcome,commit};
}

it.each([true,false])("真实宿主带诊断登记经原子结算回读；HTML=%s",async html=>{
 const f=await fixture(html),before=await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.artifactId,f.metadata.artifactId));
 expect(before).toHaveLength(0);
 expect(f.outcome.summary).toBe(JSON.stringify(f.metadata));
 const result=await f.commit();expect(result).toEqual(f.outcome);
 expect(await f.commit()).toEqual(result);
 const versions=await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.artifactId,f.metadata.artifactId));
 expect(versions).toHaveLength(1);expect(versions[0]!.metadata).toEqual(f.metadata);
 const [settled]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.operationId));
 expect(settled!.status).toBe("settled");expect(JSON.parse(settled!.resultText!).output).toEqual(f.outcome);
 const reader=createWorkbenchArtifactReadService(db,{blobs:f.blobs});
 const read=await reader.read(f.ctx,f.taskId,f.metadata.artifactId,1,0,128000);
 expect(Buffer.from(read.bytes)).toEqual(f.bytes);
});

it("拒绝诊断伪造和 metadata 篡改且不产生版本或结算账本",async()=>{
 const f=await fixture();
 const raw=()=>JSON.parse(JSON.stringify(f.outcome));
 const diagnosticCases=[
  (v:any)=>({...v,unrelated:true}),
  (v:any)=>({...v,rendererPolicy:"unknown-policy"}),
  (v:any)=>({...v,diagnostics:{...v.diagnostics,sourceHash:"0".repeat(64)}}),
  (v:any)=>({...v,diagnostics:{...v.diagnostics,extra:true}}),
  (v:any)=>({...v,diagnostics:{...v.diagnostics,status:"succeeded"}}),
  (v:any)=>({...v,diagnostics:{...v.diagnostics,scriptCount:-1}}),
  (v:any)=>({...v,diagnostics:{...v.diagnostics,degraded:"false"}}),
  (v:any)=>({...v,diagnostics:{...v.diagnostics,repairAdvice:[{}]}}),
  ()=>({rendererPolicy:"static-offline-v1"}),
  ()=>null,
 ];
 const bad=diagnosticCases.map(mutate=>{const value=raw(),part=value.data.workbench.content[1];part.text=JSON.stringify(mutate(JSON.parse(part.text)));return value;});
 for(const [key,value] of Object.entries({taskId:"foreign-task",hash:"0".repeat(64),version:2,provenance:["fake"],extra:true})){
  const changed=raw(),text=JSON.stringify({...f.metadata,[key]:value});changed.summary=text;changed.data.workbench.content[0].text=text;bad.push(changed);
 }
 const third=raw();third.data.workbench.content.push(third.data.workbench.content[1]);bad.push(third);
 const invalidJson=raw();invalidJson.data.workbench.content[1].text="{";bad.push(invalidJson);
 for(const value of bad)await expect(f.commit(value)).rejects.toThrow();
 expect(await db.select().from(workbenchArtifactLineageVersions).where(eq(workbenchArtifactLineageVersions.artifactId,f.metadata.artifactId))).toHaveLength(0);
 const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.operationId));expect(call!.status).toBe("started");expect(call!.resultText).toBeNull();
 await f.commit();
});

it("宿主未知回执由对账服务生成单条 metadata 原子结算并可重读",async()=>{
 const f=await fixture();
 await f.host.markUnknown!(f.call,{claimId:f.claimId,toolCallId:f.toolCallId,toolName:"artifact_register"});
 const reconciler=startWorkbenchArtifactReconciler(db,createWorkbenchArtifactService(db,{blobs:f.blobs}),{startImmediately:false,intervalMs:60000});
 try{
  const result=await reconciler.reconcile(f.ctx,f.conversation.id,f.operationId);expect(result.status).toBe("committed");
  expect(await reconciler.reconcile(f.ctx,f.conversation.id,f.operationId)).toEqual(result);
  const [call]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.operationId));
  const receipt=JSON.parse(call!.resultText!);expect(call!.status).toBe("settled");
  expect(receipt.output.summary).toBe(JSON.stringify(f.metadata));
  expect(receipt.output.data.workbench.content).toEqual([{type:"text",text:JSON.stringify(f.metadata)}]);
 }finally{reconciler.stop();}
});
