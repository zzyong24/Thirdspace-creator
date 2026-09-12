import {expect,it,vi} from "vitest";
import {createCurrentArtifactReader} from "../../application/context/current-artifact";
import {buildChatTools,type ChatToolDeps,type PositioningDiscoverySnapshot} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatStructuredTaskToolHost} from "./chat-structured-tool-host";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
type Restored=Awaited<ReturnType<ReturnType<typeof createChatHostContextReader>["read"]>>;
async function fixture(readCurrentScript?: NonNullable<Parameters<typeof createChatStructuredTaskToolHost>[1]["readCurrentScript"]>){
 const ctx={userId:"u",accountId:"a",source:"ai" as const,requestId:"r"},execution={executionTaskId:"task",attempt:2,fenceToken:"fence"};
 const controller=new AbortController();
 const definitions=(await prepareChatToolDefinitions(buildChatTools(["topic.enrich","positioning.generate","calibration.diagnose"],{} as ChatToolDeps),{workerStructuredNodes:true})).definitions;
 const restored={context:{...ctx},modelInput:{tools:definitions},hostContext:{chatContext:{selection:{kind:"candidate",ids:["candidate-original"],label:"选中的标题"}},structuredContext:{positioningBrief:"旧定位事实甲",accountsBrief:"旧账号",learningsBrief:"复盘",signalsBrief:"评论",knowledgeBrief:"资料"},structuredGeneration:{version:1,maxOutputTokens:2048},skillSnapshot:{skills:[{skillId:"topic.enrich"},{skillId:"positioning.generate"},{skillId:"calibration.diagnose"}]}}};
 const read=vi.fn(async()=>structuredClone(restored) as unknown as Restored),works=vi.fn(async()=>"真实作品"),discovery=vi.fn(async():Promise<PositioningDiscoverySnapshot|null>=>null);
 const resolve=createChatStructuredTaskToolHost({read},{readWorks:works,getPositioningDiscovery:discovery,readCurrentScript});
 const tools=await resolve(ctx,{} as Restored["modelInput"],execution,controller.signal);
 const scope={execution,callId:"parent",attemptId:"attempt",signal:controller.signal};
 return {ctx,execution,controller,restored,read,works,discovery,tools,scope};
}
it("只准备选题输入，不装配宿主模型执行器；候选锚点和证据清洗沿用原工具",async()=>{
 const f=await fixture(),tool=f.tools["topic.enrich"]!;
 expect(tool.execution).toBe("worker.structured-node");expect(tool.execute).toBeUndefined();
 const result=await tool.prepareGeneration!(f.ctx,{title:"错标题",verifiedBrief:"  真实来源  "},f.scope);
 expect(result.node).toMatchObject({capability:"topic.enrich",candidateId:"candidate-original",facets:{title:"选中的标题"}});
 expect(result.node.facets.knowledge).toContain("真实来源");expect(f.works).not.toHaveBeenCalled();
 expect(result.maxOutputTokens).toBe(2048);
});
it("从零开始不读取旧作品；优化按原限制读取且使用真实账号",async()=>{
 const f=await fixture(),tool=f.tools["positioning.generate"]!;
 const scratch=await tool.prepareGeneration!(f.ctx,{sourceMode:"scratch",extraBrief:"新方向"},f.scope);
 expect(f.works).not.toHaveBeenCalled();expect(JSON.stringify(scratch.node)).not.toContain("旧定位事实甲");
 await tool.prepareGeneration!(f.ctx,{sourceMode:"optimize"},f.scope);
 expect(f.works).toHaveBeenCalledWith(f.ctx,12,f.controller.signal);
});
it("前采会话缺失必须拒绝，不能使用模型自报版本产出候选",async()=>{
 const f=await fixture();
 await expect(f.tools["positioning.generate"]!.prepareGeneration!(f.ctx,{discoverySessionId:"session",discoveryRevision:99},f.scope)).rejects.toThrow("前采");
 expect(f.discovery).toHaveBeenCalledWith(f.ctx,"session",f.controller.signal);expect(f.works).not.toHaveBeenCalled();
});
it.each(["账号","版本","Skill","配置"])("准备时重新核对冻结事实：%s",async(kind)=>{
 const f=await fixture();
 if(kind==="账号")f.restored.context.accountId="other";
 if(kind==="版本")f.restored.modelInput.tools[0]!.version="changed";
 if(kind==="Skill")f.restored.hostContext.skillSnapshot.skills=[];
 if(kind==="配置")f.restored.hostContext.structuredGeneration.version=2;
 await expect(f.tools["topic.enrich"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope)).rejects.toThrow();
});
it("作品读取期间取消，不返回可执行生成输入",async()=>{
 const f=await fixture();
 f.works.mockImplementation(async()=>{f.controller.abort();return "迟到作品";});
 await expect(f.tools["positioning.generate"]!.prepareGeneration!(f.ctx,{},f.scope)).rejects.toThrow();
});

it("定位前采使用真实服务版本与 scratch 选择，忽略模型旧版本",async()=>{
 const f=await fixture();
 f.discovery.mockResolvedValue({id:"session",sourceMode:"scratch",status:"ready",revision:7,answers:[{themeId:"goal",selectedOptionIds:[],customText:"真实目标",skipped:false}],webReferences:[]});
 const result=await f.tools["positioning.generate"]!.prepareGeneration!(f.ctx,{sourceMode:"optimize",discoverySessionId:"session",discoveryRevision:99,selectedDirectionKey:"chosen"},f.scope);
 expect(result.discovery).toEqual({sessionId:"session",candidateId:"poscand:session:7:chosen",candidateRevision:7});
 expect(result.node.facets.current).toContain("真实目标");expect(result.node.facets.current).toContain("版本 7");expect(f.works).not.toHaveBeenCalled();
});
it("异步读取期间调用方修改参数不会串入本次生成",async()=>{
 const f=await fixture();let release!:(value:Restored)=>void;
 f.read.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const input={title:"最初标题",verifiedBrief:"最初事实"};
 const pending=f.tools["topic.enrich"]!.prepareGeneration!(f.ctx,input,f.scope);
 input.verifiedBrief="后来的事实";release(structuredClone(f.restored) as unknown as Restored);
 expect((await pending).node.facets.knowledge).toContain("最初事实");
});

it("聊天诊断准备沿用通用维度、原文和补充要求，没有宿主模型闭包",async()=>{
 const f=await fixture(),tool=f.tools["calibration.diagnose"];
 expect(tool).toBeDefined();expect(tool!.execution).toBe("worker.structured-node");expect(tool!.execute).toBeUndefined();
 const prepared=await tool!.prepareGeneration!(f.ctx,{title:"",script:"完整原文\n不应摘要",extraBrief:"  只审结构  "},f.scope);
 expect(prepared.node).toMatchObject({capability:"calibration.diagnose",facets:{title:"选中的标题",script:"完整原文\n不应摘要",positioning:"旧定位事实甲"}});
 expect(prepared.node.facets.extraBrief).toContain("只审结构");expect(prepared.node.facets.rubricBlock).toContain("key=hook");
 expect(prepared.discovery).toBeNull();expect(f.works).not.toHaveBeenCalled();
});

it("绑定项目时不依赖模型复述正文，真实当前稿和版本进入冻结输入",async()=>{
 const current=vi.fn(async()=>({projectId:"project-a",artifactId:"artifact-a",currentVersionId:"v2",contentHash:"hash",fullText:"真实完整正文\n第二段"}));
 const f=await fixture(current);Object.assign(f.restored.hostContext.chatContext,{projectId:"project-a"});
 const result=await f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope);
 expect(current).toHaveBeenCalledWith(f.ctx,"project-a",f.controller.signal);
 expect(result.node.facets.script).toBe("真实完整正文\n第二段");
 expect(JSON.parse(result.node.facets.__diagnosisSource!)).toMatchObject({projectId:"project-a",currentVersionId:"v2",contentHash:"hash"});
});
it("明确选中项目优先于页面项目，真实无稿保持受限诊断",async()=>{
 const current=vi.fn(async()=>null),f=await fixture(current);
 Object.assign(f.restored.hostContext.chatContext,{projectId:"page-project",selection:{kind:"project",ids:["selected-project"],label:"选中项目"}});
 const result=await f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope);
 expect(current).toHaveBeenCalledWith(f.ctx,"selected-project",f.controller.signal);
 expect(result.node.facets.script).toContain("拿不准的指标给 null");
});
it("读取权限失败不得吞成无稿，也不能调用方串账号",async()=>{
 const current=vi.fn(async()=>{throw new Error("无权读取项目");}),f=await fixture(current);
 Object.assign(f.restored.hostContext.chatContext,{projectId:"foreign"});
 await expect(f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope)).rejects.toThrow("无权读取项目");
 await expect(f.tools["calibration.diagnose"]!.prepareGeneration!({...f.ctx,accountId:"other"},{title:"标题"},f.scope)).rejects.toThrow("账号");
 expect(current).toHaveBeenCalledTimes(1);
});
it("当前稿返回另一项目或选中旧版本时必须拒绝",async()=>{
 const current=vi.fn(async()=>({projectId:"other",artifactId:"artifact",currentVersionId:"v2",contentHash:"hash",fullText:"正文"})),f=await fixture(current);
 Object.assign(f.restored.hostContext.chatContext,{projectId:"project"});
 await expect(f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope)).rejects.toThrow("项目");
 current.mockResolvedValue({projectId:"project",artifactId:"artifact",currentVersionId:"v2",contentHash:"hash",fullText:"正文"});
 Object.assign(f.restored.hostContext.chatContext,{selection:{kind:"script_section",ids:["s1"],artifactId:"artifact",versionId:"v1"}});
 await expect(f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope)).rejects.toThrow("版本");
});
it("显式文稿保留原文；读取期间取消不能返回生成输入",async()=>{
 const current=vi.fn(async()=>null),f=await fixture(current);
 const explicit=await f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题",script:"用户提供正文"},f.scope);
 expect(explicit.node.facets.script).toBe("用户提供正文");expect(current).not.toHaveBeenCalled();
 Object.assign(f.restored.hostContext.chatContext,{projectId:"project"});
 current.mockImplementation(async()=>{f.controller.abort();return null;});
 await expect(f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope)).rejects.toThrow();
});

it("真实当前稿reader→冻结任务host→诊断facets保持规范正文和版本",async()=>{
 const getProject=vi.fn(async()=>({id:"project"}));
 const current=createCurrentArtifactReader({projectsService:{getProject},artifactsService:{listProjectArtifacts:async()=>[{id:"artifact",artifactType:"output_script",currentVersionId:"v1"}],listVersions:async()=>[{id:"v2",versionNumber:2,contentText:"非当前正文"},{id:"v1",versionNumber:1,contentText:"旧字段",contentData:{sections:[{id:"s1",body:"当前稿原文\n含换行"}]}}],getScriptSections:async()=>[]}} as never);
 const f=await fixture((c,p)=>current(c,p,"output_script"));Object.assign(f.restored.hostContext.chatContext,{projectId:"project"});
 const prepared=await f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope);
 expect(prepared.node.facets.script).toBe("当前稿原文\n含换行");expect(getProject).toHaveBeenCalledWith(f.ctx,"project");
 expect(JSON.parse(prepared.node.facets.__diagnosisSource!)).toMatchObject({artifactId:"artifact",currentVersionId:"v1",contentHash:expect.stringMatching(/^[a-f0-9]{64}$/)});
});
it("已绑定项目未装配reader显式失败，不能静默按无稿诊断",async()=>{
 const f=await fixture();Object.assign(f.restored.hostContext.chatContext,{projectId:"project"});
 await expect(f.tools["calibration.diagnose"]!.prepareGeneration!(f.ctx,{title:"标题"},f.scope)).rejects.toThrow("端口未装配");
});
