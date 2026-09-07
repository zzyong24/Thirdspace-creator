import {chatWebReadDigest} from "./chat-web-read-evidence";
import {expect,it} from "vitest";
import {recoverableChatNodeParents} from "./chat-generation-recovery";
import {agenticToolOperationKey} from "./agentic-tool-binding";
type Task=Parameters<typeof recoverableChatNodeParents>[0];
type Call=Parameters<typeof recoverableChatNodeParents>[1][number];
const receipt={content:[],finishReason:{unified:"stop"},usage:{inputTokens:{total:4},outputTokens:{total:3}},warnings:[]};
function fixture(){
 const task={id:"task",kind:"ai_task",ownerType:"ai_task",userId:"u",accountId:"a",retryOfCallId:null,payload:{modelInput:{kind:"chat.run",operationKey:"chat",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"conversation",sourceMessageId:"message",system:"策略",messages:[{role:"user",content:"生成"}],maxSteps:6,maxOutputTokens:128,tools:[{name:"topic.enrich",version:"1",description:"选题",parameters:{},effect:"proposal",execution:"worker.structured-node"},{name:"script.hooks",version:"1",description:"开场",parameters:{},effect:"proposal",execution:"worker.script-hooks"}]}}} as Task;
 const call=(id:string,sequence:number,patch:Partial<Call>):Call=>({id,sequence,executionTaskId:"task",operationKey:id,retryOfCallId:null,parentCallId:null,kind:"model",inputDigest:"digest",status:"settled",reservedTokens:128,startedAttempt:1,toolExecutionClaimId:null,usage:null,resultText:null,providerResult:receipt,providerJob:null,rejectionCode:null,totalTokens:7,resultRef:null,createdAt:"fixed",updatedAt:"fixed",...patch});
 const root=call("root",1,{providerResult:{...receipt,finishReason:{unified:"tool-calls"},content:[{type:"tool-call",toolCallId:"a",toolName:"topic_enrich",input:"{}"},{type:"tool-call",toolCallId:"b",toolName:"script_hooks",input:"{}"}]}});
 const a=call("a",2,{kind:"tool",status:"started",operationKey:agenticToolOperationKey("root","a"),totalTokens:null,providerResult:null});
 const b=call("b",3,{...a,id:"b",sequence:3,operationKey:agenticToolOperationKey("root","b")});
 const childA=call("child-a",4,{parentCallId:"a",operationKey:`structured:a:${"a".repeat(64)}/model/1`});
 const childB=call("child-b",5,{parentCallId:"b",operationKey:`hooks:b:${"b".repeat(64)}/model/1`});
 return {task,calls:[root,a,b,childA,childB],childA,childB};
}
it("混合父工具以同一集合恢复，已确认末尾仍交给节点决定是否修复",()=>{
 const {task,calls}=fixture();
 expect(recoverableChatNodeParents(task,calls)).toEqual({structured:["a"],completedHooks:["b"],resumableHooks:[],scriptDrafts:[],webReads:[]});
});
it.each(["unknown","started","reserved"])("任一子调用 %s 时不恢复父集合",status=>{
 const {task,calls,childB}=fixture();childB.status=status;
 expect(recoverableChatNodeParents(task,calls)).toEqual({structured:[],completedHooks:[],resumableHooks:[],scriptDrafts:[],webReads:[]});
});
it("仅确认协议拒绝能作为下一逻辑调用前缀",()=>{
 const {task,calls,childA}=fixture();childA.status="rejected";childA.rejectionCode="STRUCTURED_PROTOCOL_UNSUPPORTED";childA.totalTokens=null;
 expect(recoverableChatNodeParents(task,calls).structured).toEqual(["a"]);
 childA.rejectionCode=null;
 expect(recoverableChatNodeParents(task,calls).structured).toEqual([]);
 task.retryOfCallId=childA.id;
 expect(recoverableChatNodeParents(task,calls).structured).toEqual(["a"]);
});
it.each(["跳号","换输入重试","跨任务","未知用量","多余父工具"])("拒绝损坏的恢复链：%s",mode=>{
 const {task,calls,childA}=fixture();
 if(mode==="跳号")childA.operationKey=childA.operationKey.replace("/model/1","/model/2");
 if(mode==="换输入重试"){
  childA.status="rejected";childA.totalTokens=null;
  calls.push({...childA,id:"retry",sequence:6,status:"settled",retryOfCallId:childA.id,inputDigest:"changed",totalTokens:7});
 }
 if(mode==="跨任务")childA.executionTaskId="other";
 if(mode==="未知用量")childA.totalTokens=null;
 if(mode==="多余父工具")calls.push({...calls[1]!,id:"foreign",sequence:6});
 expect(recoverableChatNodeParents(task,calls)).toEqual({structured:[],completedHooks:[],resumableHooks:[],scriptDrafts:[],webReads:[]});
});

it("混合网页与生成回合共享恢复集合；缺少网页事实时整体待对账",()=>{
 const {task,calls}=fixture();
 const payload=task.payload as {modelInput:{tools:unknown[]}};
 payload.modelInput.tools.push({name:"web.read",version:"1",description:"网页",parameters:{},effect:"committed",execution:"worker.web-read"});
 (calls[0]!.providerResult as {content:unknown[]}).content.push({type:"tool-call",toolCallId:"web",toolName:"web_read",input:'{"url":"https://example.com/"}'});
 const parent={...calls[1]!,id:"web",sequence:6,operationKey:agenticToolOperationKey("root","web")};calls.push(parent);
 const observation={text:"正文",title:"标题",finalUrl:"https://example.com/",extractor:"readability" as const,extractPath:"readability" as const,turnCount:null};
 const evidence={id:"fact",executionTaskId:task.id,originCallId:parent.id,requestedUrl:observation.finalUrl,sourceUrl:observation.finalUrl,title:observation.title,fullText:observation.text,contentHash:chatWebReadDigest(observation.finalUrl,observation),byteLength:Buffer.byteLength(observation.text),createdAt:"fixed",metadata:{kind:"chat.web.read",inputDigest:parent.inputDigest,extractor:observation.extractor,extractPath:observation.extractPath,turnCount:null}};
 expect(recoverableChatNodeParents(task,calls,[evidence])).toEqual({structured:["a"],completedHooks:["b"],resumableHooks:[],scriptDrafts:[],webReads:["web"]});
 for(const rows of [[],[{...evidence,executionTaskId:"other"}],[{...evidence,metadata:{...evidence.metadata,turnCount:1}}]]) {
  expect(recoverableChatNodeParents(task,calls,rows)).toEqual({structured:[],completedHooks:[],resumableHooks:[],scriptDrafts:[],webReads:[]});
 }
});


it("整稿纯事务及已结算授权与同轮生成一起恢复，未知授权不重发",()=>{
 const {task,calls}=fixture();
 const payload=task.payload as {modelInput:{tools:unknown[]}};
 payload.modelInput.tools.push({name:"script.draft",version:"1",description:"整稿",parameters:{},effect:"committed",execution:"worker.script-draft"});
 (calls[0]!.providerResult as {content:unknown[]}).content.push({type:"tool-call",toolCallId:"draft",toolName:"script_draft",input:'{"mode":"generate"}'});
 const parent={...calls[1]!,id:"draft",sequence:6,operationKey:agenticToolOperationKey("root","draft")};calls.push(parent);
 expect(recoverableChatNodeParents(task,calls)).toMatchObject({structured:["a"],completedHooks:["b"],scriptDrafts:["draft"]});
 const child={...calls[4]!,id:"draft-auth",parentCallId:"draft",sequence:7,operationKey:`script-draft:draft:${"c".repeat(64)}/model/1`};calls.push(child);
 expect(recoverableChatNodeParents(task,calls).scriptDrafts).toEqual(["draft"]);
 child.status="unknown";child.totalTokens=null;
 expect(recoverableChatNodeParents(task,calls)).toEqual({structured:[],completedHooks:[],resumableHooks:[],scriptDrafts:[],webReads:[]});
});
