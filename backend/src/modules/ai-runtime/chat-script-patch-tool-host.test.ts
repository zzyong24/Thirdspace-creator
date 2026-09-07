import {it,expect,vi} from "vitest";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatTaskToolHost} from "./chat-task-tool-host";
import type {ContextReaders} from "./chat-runner";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
type Restored=Awaited<ReturnType<ReturnType<typeof createChatHostContextReader>["read"]>>;
async function fixture(bound=false){
 const context={userId:"patch-u",accountId:"patch-a",requestId:"test",source:"user" as const};
 const execution={executionTaskId:"patch-task",attempt:1,fenceToken:"fence"},signal=new AbortController().signal;
 const selection=bound?{kind:"script_section",ids:["section-1"],artifactId:"artifact",versionId:"version-1",excerpt:"原始段落"}:undefined;
 const raw={artifactId:"artifact",currentVersionId:"version-1",sections:[{sectionRef:"section-1",body:"原始段落"}]};
 const getArtifactText=vi.fn(async()=>structuredClone(raw));
 const deps={boundProjectId:"project",getArtifactText:async()=>raw,...(bound?{scriptPatchAnchor:{artifactId:"artifact",versionId:"version-1",sectionId:"section-1",originalText:"原始段落"}}:{})} as unknown as ChatToolDeps;
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["script.patch"],deps))).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{chatContext:{surface:"project",projectId:"project",selection}}} as unknown as Restored;
 const read=vi.fn(async()=>structuredClone(restored));
 const resolve=createChatTaskToolHost({read},{getArtifactText} as unknown as ContextReaders);
 const tools=await resolve(context,restored.modelInput,execution,signal);
 return {context,execution,signal,restored,raw,getArtifactText,read,resolve,tool:tools["script.patch"],scope:{execution,aiTaskId:"ai",callId:"call",toolCallId:"tool",signal}};
}
it.each([false,true])("局部改稿经组合宿主保留原卡片和参数，选中模式=%s",async bound=>{
 const f=await fixture(bound);expect(f.tool).toBeDefined();
 const input={replacementText:" 新段落 ",summary:" 仅改这一段 ",...(bound?{}:{sectionRef:"section-1"})};
 expect(await f.tool!.execute!(f.context,input,f.scope)).toMatchObject({status:"ok",sideEffect:"proposal",data:{kind:"script.patch",artifactId:"artifact",versionId:"version-1",sectionId:"section-1",originalText:"原始段落",replacementText:"新段落",summary:"仅改这一段"}});
 expect(f.getArtifactText).toHaveBeenCalledWith(f.context,{projectId:"project",artifactType:"output_script"});
});
it.each(["版本","原文","段落","账号","定义"])("冻结选中段的%s改变后拒绝产补丁",async kind=>{
 const f=await fixture(true);expect(f.tool).toBeDefined();
 if(kind==="版本")f.raw.currentVersionId="version-2";
 if(kind==="原文")f.raw.sections[0]!.body="另一份原文";
 if(kind==="段落")f.raw.sections=[];
 if(kind==="账号")f.restored.context.accountId="other";
 if(kind==="定义")f.restored.modelInput.tools[0]!.version="changed";
 expect((await f.tool!.execute!(f.context,{replacementText:"新文稿"},f.scope)).status).not.toBe("ok");
});
it("自然语言模式执行时重读当前稿，失效引用与重复引用不能产候选",async()=>{
 const f=await fixture();expect(f.tool).toBeDefined();
 f.raw.sections=[{sectionRef:"new-ref",body:"当前段落"}];f.raw.currentVersionId="version-2";
 expect((await f.tool!.execute!(f.context,{sectionRef:"section-1",replacementText:"新文稿"},f.scope)).status).not.toBe("ok");
 expect(await f.tool!.execute!(f.context,{sectionRef:"new-ref",replacementText:"新文稿"},f.scope)).toMatchObject({status:"ok",data:{versionId:"version-2",originalText:"当前段落"}});
 f.raw.sections.push({...f.raw.sections[0]!});
 expect((await f.tool!.execute!(f.context,{sectionRef:"new-ref",replacementText:"新文稿"},f.scope)).status).not.toBe("ok");
});
it("不变正文、伪造锚点和取消均不产生可采纳成功",async()=>{
 const f=await fixture(true);expect(f.tool).toBeDefined();
 expect((await f.tool!.execute!(f.context,{replacementText:" 原始段落 "},f.scope)).status).not.toBe("ok");
 expect((await f.tool!.execute!(f.context,{replacementText:"新文稿",artifactId:"forged"},f.scope)).status).not.toBe("ok");
 const controller=new AbortController();f.getArtifactText.mockImplementation(async()=>{controller.abort();return structuredClone(f.raw);});
 expect((await f.tool!.execute!(f.context,{replacementText:"新文稿"},{...f.scope,signal:controller.signal})).status).not.toBe("ok");
});

it("无项目的显式选中段使用真实选择解析端口，仍核对原版本",async()=>{
 const f=await fixture(true);f.restored.hostContext.chatContext.projectId=null;
 const resolveSelection=vi.fn(async()=>({artifactId:"artifact",versionId:"version-1",sectionId:"section-1",originalText:"原始段落"}));
 const resolve=createChatTaskToolHost({read:f.read},{} as ContextReaders,{scriptPatch:{resolveSelection}});
 const tool=(await resolve(f.context,f.restored.modelInput,f.execution,f.signal))["script.patch"]!;
 expect(await tool.execute!(f.context,{replacementText:"新正文"},f.scope)).toMatchObject({status:"ok",data:{versionId:"version-1",replacementText:"新正文"}});
 resolveSelection.mockResolvedValue({artifactId:"artifact",versionId:"version-2",sectionId:"section-1",originalText:"后来保存的正文"});
 expect((await tool.execute!(f.context,{replacementText:"新正文"},f.scope)).status).not.toBe("ok");
});

it("重建工具只消费冻结定义，用户改稿不阻断历史结果回放",async()=>{
 const f=await fixture(true);f.raw.currentVersionId="version-2";f.raw.sections[0]!.body="用户已经改稿";
 const rebuilt=await f.resolve(f.context,f.restored.modelInput,f.execution,f.signal);
 expect(rebuilt["script.patch"]).toBeDefined();
 expect((await rebuilt["script.patch"]!.execute!(f.context,{replacementText:"基于旧稿的建议"},f.scope)).status).not.toBe("ok");
});
