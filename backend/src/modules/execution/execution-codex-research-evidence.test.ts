import {afterAll,beforeAll,expect,it} from 'vitest';
import {z} from 'zod';
import {createDb,aiTasks,executionTasks,executionCalls,eq,type Db} from '@creatoros/backend';
import {createExecutionRoute,browserObserveInputSchema} from '@creatoros/contract/execution-worker';
import {createPersistentTaskService} from './persistent-task.service';
import {createExecutionCallLedgerService} from './execution-call-ledger.service';
import {createExecutionAgenticToolPorts} from './execution-agentic-tool-ports.service';
import {createExecutionResearchEvidenceService,verifyReadEvidence} from './execution-research-evidence.service';
import {createExecutionBrowserEvidenceService} from './execution-browser-evidence.service';
const now=()=> '2026-10-11T08:00:00.000Z',budget={maxCalls:10,maxTokens:10000,deadlineMs:120000},ctx={userId:'native-evidence-user',accountId:'native-evidence-account',requestId:'test',source:'user' as const};
const tools={'web.read':{version:'1',effect:'none' as const,parameters:z.object({url:z.string(),offset:z.number().default(0),snapshotId:z.string().optional(),evidenceRef:z.string().optional()})},'browser.observe':{version:'1',effect:'none' as const,parameters:browserObserveInputSchema}};
let db:Db,close:()=>Promise<void>;beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
async function fixture(id:string){
 const tasks=createPersistentTaskService(db,{now}),payload={modelInput:{kind:'agentic.run',dryRun:false,browserAuthorization:{source:'user_task',allowedDomains:['example.com'],allowInteraction:false},tools:Object.entries(tools).map(([name,t])=>({name,version:t.version}))},executionRoute:createExecutionRoute('codex'),codexCalls:{} as Record<string,{threadId:string;turnId:string;tools:Record<string,unknown>}>};
 const task=await tasks.enqueue(ctx,{kind:'ai_task',ownerType:'ai_task',ownerId:id,idempotencyKey:id,payload});await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:'exec.agentic.research',executionTaskId:task.id,status:'running',idempotencyKey:id,requestedAt:now()});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:'worker'}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken},deps={now,budget,tools},ledger=createExecutionCallLedgerService(db,deps),ports=createExecutionAgenticToolPorts(db,deps),service=createExecutionResearchEvidenceService(db,deps);
 const model=await ledger.reserve(ref,{kind:'model',operationKey:'native-turn',inputDigest:'sha256:'+'a'.repeat(64),reservedTokens:100});await ledger.start(ref,model.id);payload.codexCalls[model.id]={threadId:'native-thread',turnId:'native-turn',tools:{}};
 async function tool(id:string,name:string,input:unknown){payload.codexCalls[model.id]!.tools[id]={toolCallId:id,toolName:name,input:JSON.stringify(input)};await db.update(executionTasks).set({payload}).where(eq(executionTasks.id,task.id));const call=await ports.reserve(ref,{modelCallId:model.id,toolCallId:id});await ports.start(ref,{callId:call.callId});return call;}
 return {task,ref,model,payload,ledger,ports,service,tool,deps};
}
it('native单回合分页使用真实工具顺序，原正文回放且不增加模型调用',async()=>{
 const f=await fixture('native-pages'),read=await f.tool('read','web.read',{url:'https://example.com'}),fullText='真实网页正文'.repeat(3000),first=await f.service.settleRead(f.ref,{callId:read.callId,observation:{sourceUrl:'https://example.com',title:'来源',fullText}}),data=first.data as {snapshotId:string;evidenceRef:string};
 const next=await f.tool('next','web.read',{url:'https://example.com',offset:12000,snapshotId:data.snapshotId,evidenceRef:data.evidenceRef}),output=await f.service.readWindow(f.ref,{callId:next.callId});expect((output.data as {text:string}).text===fullText.slice(12000,24000)).toBe(true);expect(await f.service.readWindow(f.ref,{callId:next.callId})).toEqual(output);expect((await f.ledger.inspect(f.ref)).calls.filter(c=>c.kind==='model')).toHaveLength(1);
 await expect(db.transaction(tx=>verifyReadEvidence(tx,f.task.id,[data.evidenceRef],2))).rejects.toThrow();
});
it('native started浏览器证据来自原thread工具，篡改session及降为Pi均拒绝',async()=>{
 const f=await fixture('native-browser'),call=await f.tool('observe','browser.observe',{sessionId:'s',url:'https://example.com'}),observation={sessionId:'s',observationId:'seen',url:'https://example.com',title:'真实页面',text:'真实可见正文',elements:[]},output={status:'ok',summary:'已观察',evidence:[{sourceUrl:observation.url,title:observation.title,text:observation.text}],data:{observation},sideEffect:'none',error:null,continuation:null};
 const saved=await createExecutionBrowserEvidenceService(db,f.deps).settle(f.ref,{callId:call.callId,output}),ref=(saved.data as {evidenceRef:string}).evidenceRef;
 expect(await db.transaction(tx=>verifyReadEvidence(tx,f.task.id,[ref],3))).toHaveLength(1);
 f.payload.codexCalls[f.model.id]!.tools.observe={toolCallId:'observe',toolName:'browser.observe',input:'{"sessionId":"foreign","url":"https://example.com"}'};await db.update(executionTasks).set({payload:f.payload}).where(eq(executionTasks.id,f.task.id));await expect(db.transaction(tx=>verifyReadEvidence(tx,f.task.id,[ref],3))).rejects.toThrow();
 await db.update(executionTasks).set({payload:{...f.payload,executionRoute:createExecutionRoute('pi')}}).where(eq(executionTasks.id,f.task.id));await expect(db.transaction(tx=>verifyReadEvidence(tx,f.task.id,[ref],3))).rejects.toThrow();
 expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.model.id)))[0]?.status).toBe('started');
});
