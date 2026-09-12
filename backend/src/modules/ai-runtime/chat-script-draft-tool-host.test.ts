import {expect,it,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatScriptDraftTaskHost,type ChatScriptDraftTaskPorts} from "./chat-script-draft-tool-host";
import {prepareScriptDraftInput} from "./chat-script-draft-preparation";
import {buildScriptDraftTaskInputData} from "../ai/script-draft-task-input";
import {readFrozenScriptSources} from "./script-preparation";
async function fixture(current:NonNullable<ChatScriptDraftTaskPorts["readCurrentScript"]>){
 const ctx={userId:"u",accountId:"a",source:"ai" as const,requestId:"r"},execution={executionTaskId:"task",attempt:1,fenceToken:"fence"};
 const tools=(await prepareChatToolDefinitions(buildChatTools(["script.draft"],{} as ChatToolDeps),{workerScriptDraft:true})).definitions;
 const restored={context:ctx,modelInput:{tools},hostContext:{chatContext:{projectId:"project"}}};
 const prepareDraft=vi.fn(async(_ctx:unknown,input:unknown)=>input);
 const resolve=createChatScriptDraftTaskHost({read:async()=>structuredClone(restored)} as never,{readCurrentScript:current,prepareDraft,wakeTask:async()=>{}} as unknown as ChatScriptDraftTaskPorts);
 const host=await resolve(ctx,{} as never,execution,undefined);
 return {ctx,restored,prepareDraft,tool:host["script.draft"]!,scope:{execution,callId:"call",attemptId:"attempt",signal:new AbortController().signal}};
}
const source={projectId:"project",artifactId:"artifact",currentVersionId:"v2",contentHash:"unused",fullText:"WASD移动，QQ恢复生命值，自动射击。"};
it("无 sourceRefs 的真实用户要求与宿主当前完整稿共同进入冻结生成输入",async()=>{
 const reader=vi.fn(async()=>source),f=await fixture(reader);
 const prepared=prepareScriptDraftInput({instruction:"保留射击玩法"},[],"只生成候选，不改已有稿");
 if(prepared.mode!=="generate")throw new Error();
 await f.tool.prepareTask!(f.ctx,JSON.parse(JSON.stringify(prepared.dispatchInput)),f.scope);
 const input=f.prepareDraft.mock.calls[0]![1] as Record<string,unknown>;
 const frozen=readFrozenScriptSources(buildScriptDraftTaskInputData({...input,artifactId:"artifact",projectId:"project"}));
 expect(frozen.instruction).toContain("只生成候选，不改已有稿");expect(frozen.instruction).toContain("保留射击玩法");
 expect(frozen.sources[0]).toMatchObject({body:source.fullText,sourceId:"artifact:v2",complete:true});
 expect(reader).toHaveBeenCalledWith(f.ctx,"project",f.scope.signal);
 expect(prepared.dispatchInput).not.toHaveProperty("sourceSnapshots");
});
it("显式来源与保真导入不被自动稿覆盖；确实无稿仍可生成",async()=>{
 const reader=vi.fn(async()=>null),f=await fixture(reader);
 await f.tool.prepareTask!(f.ctx,{instruction:"新写"},f.scope);
 expect(f.prepareDraft.mock.calls[0]![1]).not.toHaveProperty("sourceSnapshots");
 reader.mockClear();
 await f.tool.prepareTask!(f.ctx,{sourceSnapshots:[{body:"用户选择的资料"}]},f.scope);
 await f.tool.prepareTask!(f.ctx,{draftMode:"verbatim",verbatimSourceText:"精确保真"},f.scope);
 expect(reader).toHaveBeenCalledTimes(1);
 expect(f.prepareDraft.mock.calls[1]![1]).toMatchObject({sourceSnapshots:[{body:"用户选择的资料"}]});
});
it("跨项目、权限失败、过期选区和取消均不得创建子任务",async()=>{
 const reader=vi.fn(async()=>({...source,projectId:"other"})),f=await fixture(reader);
 await expect(f.tool.prepareTask!(f.ctx,{instruction:"改稿"},f.scope)).rejects.toThrow("归属");
 reader.mockRejectedValueOnce(new Error("无权读取"));
 await expect(f.tool.prepareTask!(f.ctx,{instruction:"改稿"},f.scope)).rejects.toThrow("无权读取");
 reader.mockResolvedValue(source);
 Object.assign(f.restored.hostContext.chatContext,{selection:{kind:"script_section",artifactId:"artifact",versionId:"old"}});
 await expect(f.tool.prepareTask!(f.ctx,{instruction:"改稿"},f.scope)).rejects.toThrow("版本");
 expect(f.prepareDraft).not.toHaveBeenCalled();
});
it("伪造 sourceRefs 仍被拒绝，不能降级到另一份稿件",()=>{
 expect(()=>prepareScriptDraftInput({instruction:"改稿",sourceRefs:["artifact:invented"]},[],"改稿")).toThrow();
});

it("附件与当前稿同时保留，完整长消息末尾要求经过任务入队仍不丢失",async()=>{
 const f=await fixture(async()=>source);
 const last="不要改动射击玩法，也不要直接写入稿面";
 const prepared=prepareScriptDraftInput({sourceRefs:["attachment:1"],instruction:"结合附件改稿"},[{ref:"attachment:1",label:"附件",text:"事实补充",truncated:false}],"长稿".repeat(3000)+last);
 if(prepared.mode!=="generate")throw new Error();
 await f.tool.prepareTask!(f.ctx,JSON.parse(JSON.stringify(prepared.dispatchInput)),f.scope);
 const input=f.prepareDraft.mock.calls[0]![1] as Record<string,unknown>;
 const frozen=readFrozenScriptSources(buildScriptDraftTaskInputData({...input,artifactId:"artifact",projectId:"project"}));
 expect(frozen.instruction).toContain(last);
 expect(frozen.sources.map(s=>s.body)).toEqual(["事实补充",source.fullText]);
 expect(frozen.sources.map(s=>s.order)).toEqual([0,1]);
});
it("新项目无来源的本轮要求经过任务入队仍保留",()=>{
 expect(readFrozenScriptSources(buildScriptDraftTaskInputData({artifactId:"a",projectId:"p",instruction:"保留要求"})).instruction).toBe("保留要求");
});
