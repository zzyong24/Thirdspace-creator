import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {ContextReaders} from "./chat-assembly-types";
import type {ChatMaterialTaskPorts} from "./chat-material-task-host";

async function fixture(enabled=true){
 const context={userId:"u",accountId:"a",requestId:"r",source:"user" as const};
 const execution={executionTaskId:"parent",attempt:1,fenceToken:"f"};
 const tools=buildChatTools(["material.generate"],{} as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(tools,{atomicMaterialGenerate:enabled} as never)).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{chatContext:{projectId:"project",functionKey:"material.generate.video"}}};
 const read=vi.fn(async()=>structuredClone(restored));
 const source={artifactType:"output_script",projectId:"project",currentVersionId:"current-v2",contentHash:"hash-v2",fullText:"当前原文",sections:[{sectionRef:"section-2",index:0,heading:"当前段",body:"当前原文",sectionType:null,startSeconds:null,endSeconds:null}]};
 const getArtifactText=vi.fn(async()=>structuredClone(source));
 const commit=vi.fn(),prepareTaskCommit=vi.fn<ChatMaterialTaskPorts["prepareTaskCommit"]>(async()=>({commit})),wakeTask=vi.fn(async()=>{});
 const readers={getArtifactText};
 const resolve=createChatTaskToolHost({read} as never,readers as unknown as ContextReaders,{material:{prepareTaskCommit,wakeTask}});
 const bound=await resolve(context,restored.modelInput as never,execution,new AbortController().signal);
 return {context,execution,tools,restored,source,read,getArtifactText,readers,prepareTaskCommit,commit,wakeTask,bound,scope:{execution,callId:"call",attemptId:"chat-submit:original-call"}};
}
const input={kind:"image",prompt:" 原始画面 ",sectionRef:"section-2",visualPurpose:"mechanism",style:" 简洁 "};
it("素材原子提交显式启用且保留原 schema 与描述",async()=>{
 const f=await fixture(),legacy=(await prepareChatToolDefinitions(f.tools)).definitions[0]!;
 expect(f.restored.modelInput.tools[0]).toMatchObject({execution:"host.task-submit",effect:"committed",parameters:legacy.parameters,description:legacy.description});
 expect(f.restored.modelInput.tools[0]!.version).not.toBe(legacy.version);
 expect(f.bound["material.generate"]?.prepareTask).toBeTypeOf("function");
 expect(f.bound["material.generate"]?.execute).toBeUndefined();
 expect((await fixture(false)).bound["material.generate"]).toBeUndefined();
});
it("同一次当前稿读取绑定提示词与快照，准备不提交或唤醒",async()=>{
 const f=await fixture(),tool=f.bound["material.generate"]!;
 const prepared=await tool.prepareTask!(f.context,input,f.scope);
 expect(f.getArtifactText).toHaveBeenCalledExactlyOnceWith(f.context,{projectId:"project",artifactType:"output_script"});
 expect(f.prepareTaskCommit).toHaveBeenCalledExactlyOnceWith(f.context,{taskType:"asset.generate",attemptId:f.scope.attemptId,inputData:{projectId:"project",kind:"video",prompt:expect.stringContaining("版本:current-v2"),style:"简洁",scriptSnapshot:f.source}});
 expect(f.prepareTaskCommit.mock.calls[0]?.[1].inputData?.prompt).toContain("段落原文:当前原文");
 expect(f.commit).not.toHaveBeenCalled();expect(f.wakeTask).not.toHaveBeenCalled();
 expect(prepared.result({id:"child"} as never)).toMatchObject({status:"ok",sideEffect:"committed",data:{kind:"material.generate",taskId:"child",kindOf:"video",status:"queued",error:null}});
 await tool.wakeTask!(f.context,"child");expect(f.wakeTask).toHaveBeenCalledExactlyOnceWith(f.context,"child");
});
it("文章段落原子生成只冻结当前文章段落，不读取同项目视频脚本",async()=>{
 const f=await fixture(),tool=f.bound["material.generate"]!;
 f.restored.hostContext.chatContext.functionKey="material.generate.image";
 (f.restored.hostContext.chatContext as typeof f.restored.hostContext.chatContext & {selection:unknown}).selection={kind:"article_section",outputId:"article-output",versionId:"article-v3",ids:["section-1"]};
 const getArticleForImage=vi.fn(async()=>({projectId:"project",outputId:"article-output",artifactId:"article-artifact",currentVersionId:"article-v3",current:{sections:[{sectionId:"section-1",heading:"文章标题",body:"文章真实正文"}],visualBriefs:[{sectionId:"section-1",brief:"解释概念关系"}]}}));
 (f.readers as typeof f.readers & Pick<ContextReaders,"getArticleForImage">).getArticleForImage=getArticleForImage;
 await tool.prepareTask!(f.context,{kind:"image",prompt:"概念配图"},f.scope);
 expect(getArticleForImage).toHaveBeenCalledExactlyOnceWith(f.context,{outputId:"article-output"});
 expect(f.getArtifactText).not.toHaveBeenCalled();
 expect(f.prepareTaskCommit).toHaveBeenCalledWith(f.context,{taskType:"asset.generate",attemptId:f.scope.attemptId,inputData:{kind:"image",projectId:"project",prompt:expect.stringContaining("段落原文:文章真实正文"),articleSnapshot:expect.objectContaining({sectionId:"section-1",visualBrief:"解释概念关系"})}});
 expect(f.prepareTaskCommit.mock.calls[0]?.[1].inputData).not.toHaveProperty("scriptSnapshot");
});
it.each(["account","definition","cancel","missing-reader","stale-section","fact-capture"])("素材准备拒绝 %s，不进入提交",async reason=>{
 const f=await fixture(),tool=f.bound["material.generate"]!;
 if(reason==="account")f.restored.context.accountId="other";
 if(reason==="definition")f.restored.modelInput.tools[0]!.version="changed";
 if(reason==="missing-reader")delete (f.readers as Partial<ContextReaders>).getArtifactText;
 const raw={...input,...(reason==="stale-section"?{sectionRef:"gone"}:{}),...(reason==="fact-capture"?{mediaKind:"fact_capture"}:{})};
 await expect(tool.prepareTask!(f.context,raw,{...f.scope,...(reason==="cancel"?{signal:AbortSignal.abort()}: {})})).rejects.toThrow();
 expect(f.prepareTaskCommit).not.toHaveBeenCalled();expect(f.wakeTask).not.toHaveBeenCalled();
});
it("当前稿读取期间取消，不产生待提交任务",async()=>{
 const f=await fixture(),controller=new AbortController();
 f.getArtifactText.mockImplementationOnce(async()=>{controller.abort();return f.source;});
 await expect(f.bound["material.generate"]!.prepareTask!(f.context,input,{...f.scope,signal:controller.signal})).rejects.toThrow();
 expect(f.prepareTaskCommit).not.toHaveBeenCalled();
});
it("无项目的素材生成不读取项目稿，仍使用原始描述",async()=>{
 const f=await fixture();f.restored.hostContext.chatContext.projectId="";f.restored.hostContext.chatContext.functionKey="";
 await f.bound["material.generate"]!.prepareTask!(f.context,{kind:"image",prompt:" 独立画面 "},f.scope);
 expect(f.getArtifactText).not.toHaveBeenCalled();
 expect(f.prepareTaskCommit).toHaveBeenCalledExactlyOnceWith(f.context,{taskType:"asset.generate",attemptId:f.scope.attemptId,inputData:{kind:"image",prompt:"独立画面"}});
});
it("读取等待期间更改调用方参数和 attempt 不改变提交意图",async()=>{
 const f=await fixture(),raw={...input},scope={...f.scope};
 let release!:()=>void;
 const hold=new Promise<void>(resolve=>{release=resolve;});
 f.read.mockImplementationOnce(async()=>{await hold;return structuredClone(f.restored);});
 const work=f.bound["material.generate"]!.prepareTask!(f.context,raw,scope);
 raw.prompt="篡改描述";raw.sectionRef="other";scope.attemptId="chat-submit:other";
 release();await work;
 expect(f.prepareTaskCommit).toHaveBeenCalledWith(f.context,expect.objectContaining({attemptId:f.scope.attemptId,inputData:expect.objectContaining({prompt:expect.stringContaining("原始画面")})}));
});
it("提交准备期间取消，不返回可提交对象或唤醒任务",async()=>{
 const f=await fixture(),controller=new AbortController();
 f.prepareTaskCommit.mockImplementationOnce(async()=>{controller.abort();return {commit:f.commit};});
 await expect(f.bound["material.generate"]!.prepareTask!(f.context,input,{...f.scope,signal:controller.signal})).rejects.toThrow();
 expect(f.commit).not.toHaveBeenCalled();expect(f.wakeTask).not.toHaveBeenCalled();
});
