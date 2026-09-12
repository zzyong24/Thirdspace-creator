import {beforeEach, describe, expect, it, vi} from "vitest";
import {createDb} from "@creatoros/backend";
import {ENDPOINTS, type RequestContext} from "@creatoros/contract";
import {createArtifactsService} from "./artifacts.service";
import {createArtifactsTransport} from "./artifacts.transport";
import {createCurrentArtifactReader} from "../../application/context/current-artifact";
import {buildChatTools, type ChatToolDeps} from "../ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
import {applyLegacyScriptRange, createLegacyScriptRange, legacyScriptHash} from "./legacy-script-patch";
const ctx: RequestContext = {userId:"u",accountId:"a",requestId:"r",source:"user"};
const text = "开头😀\r\n这是目标原句。\r\n尾声保持原样。";
const originalText = "这是目标原句。";
let service: ReturnType<typeof createArtifactsService>;
beforeEach(async()=>{const {db}=await createDb();let n=0;service=createArtifactsService({db,now:()=>"2026-09-12T00:00:00.000Z",nextId:p=>`${p}-${++n}`});});
async function seed(family="transcript") {
 const artifact=await service.createArtifact(ctx,{projectId:"p",title:"旧稿",artifactType:"output_script",stage:"script"});
 const source=await service.createVersion(ctx,artifact.id,{contentText:family==="contentText"?text:"",contentData:{...(family!=="contentText"?{[family]:text}:{}),metadata:{keep:true},html:"<p>旧稿</p>"},changeSummary:"原稿"});
 return {artifact,source};
}
function reader(){return createCurrentArtifactReader({projectsService:{getProject:async()=>({id:"p"})} as never,artifactsService:service});}
async function tools(){return buildChatTools(["context.artifact.text","script.patch"],{boundProjectId:"p",getArtifactText:()=>reader()(ctx,"p","output_script")} as unknown as ChatToolDeps);}
async function execute(tool: unknown,input: unknown){return (tool as {execute:(input:unknown,options:unknown)=>Promise<any>}).execute(input,{toolCallId:"test",messages:[]});}
const transport=()=>createArtifactsTransport(()=>service);
async function apply(artifactId:string,body:unknown,context=ctx){return transport().request(ENDPOINTS.applyScriptPatch,{params:{artifactId},body:ENDPOINTS.applyScriptPatch.body.parse(body)},context);}
describe("T957 纯文稿读取→候选→公开采纳→重读→撤销",()=>{
 it.each(["transcript","contentText","body"])("%s 保留 CRLF、emoji 和前后文；只在采纳后新增版本",async family=>{
  const {artifact,source}=await seed(family);const before=await service.listVersions(ctx,artifact.id);const t=await tools();
  const context=await execute(t["context.artifact.text"],{artifactType:"output_script"});
  expect(context.sections).toEqual([]);expect(context.contentHash).toBe(legacyScriptHash(text));
  const proposal=await execute(t["script.patch"],{originalText,replacementText:"新的目标句。",expectedVersionId:context.currentVersionId,contentHash:context.contentHash});
  expect(proposal.kind).toBe("script.patch");expect(await service.listVersions(ctx,artifact.id)).toEqual(before);
  const result=await apply(artifact.id,{expectedVersionId:proposal.versionId,sectionId:proposal.sectionId,expectedOriginalText:proposal.originalText,replacementText:proposal.replacementText}) as any;
  expect(result.error).toBeUndefined();const next=await reader()(ctx,"p","output_script");expect(next?.fullText).toBe(text.replace(originalText,"新的目标句。"));
  const versions=await service.listVersions(ctx,artifact.id);const added=versions.find(v=>v.id===next?.currentVersionId)!;
  expect(added.contentData).toMatchObject({metadata:{keep:true}});expect(added.contentData).not.toHaveProperty("html");
  expect(versions.find(v=>v.id===source.id)).toEqual(source);
  await service.restoreVersion(ctx,artifact.id,source.id,next!.currentVersionId);expect((await reader()(ctx,"p","output_script"))?.fullText).toBe(text);
 });
 it("工具冻结版本绑定新参数，缺少版本/hash 或虚构 full 不产候选",async()=>{
  await seed();const t=await tools();const defs=await prepareChatToolDefinitions(t);expect(defs.definitions.find(d=>d.name==="script.patch")?.version).toMatch(/^chat-tools-script-patch-v2:/);
  for(const input of [{originalText,replacementText:"改稿"},{sectionRef:"full",replacementText:"改稿"}]){
   const result=await execute(t["script.patch"],input);expect(result.error).toBeTruthy();expect(result.sectionId).toBeFalsy();
  }
 });
 it("版本、归属或结构改变均拒绝，不创建版本",async()=>{
  const {artifact,source}=await seed();const input={expectedVersionId:source.id,sectionId:createLegacyScriptRange(text,originalText),expectedOriginalText:originalText,replacementText:"新句"};
  await expect(service.applyScriptPatch({...ctx,accountId:"other"},artifact.id,input)).rejects.toThrow();
  const other=await seed();await expect(service.applyScriptPatch(ctx,other.artifact.id,input)).rejects.toThrow();
  await service.createVersion(ctx,artifact.id,{contentText:text,contentData:{sections:[{id:"s",body:text}]},changeSummary:"结构化"});
  await expect(service.applyScriptPatch(ctx,artifact.id,input)).rejects.toThrow();
  const current=(await service.getArtifact(ctx,artifact.id)).currentVersionId!;
  await expect(service.applyScriptPatch(ctx,artifact.id,{...input,expectedVersionId:current})).rejects.toThrow();
 });
 it("全文相同但版本改变仍拒绝旧纯文候选",async()=>{
  const {artifact,source}=await seed();await service.createVersion(ctx,artifact.id,{contentText:text,contentData:{transcript:text},changeSummary:"相同内容新版本"});
  await expect(service.applyScriptPatch(ctx,artifact.id,{expectedVersionId:source.id,sectionId:createLegacyScriptRange(text,originalText),expectedOriginalText:originalText,replacementText:"新句"})).rejects.toThrow();
 });
 it("写入前并发编辑由 CAS 拒绝，保留用户新版本",async()=>{
  const {artifact,source}=await seed();const create=service.createVersion.bind(service);
  const spy=vi.spyOn(service,"createVersion").mockImplementationOnce(async(...args)=>{
   await create(ctx,artifact.id,{contentText:"用户并发编辑",changeSummary:"并发"});
   return create(...args);
  });
  await expect(service.applyScriptPatch(ctx,artifact.id,{expectedVersionId:source.id,sectionId:createLegacyScriptRange(text,originalText),expectedOriginalText:originalText,replacementText:"新句"})).rejects.toThrow();
  spy.mockRestore();expect((await reader()(ctx,"p","output_script"))?.fullText).toBe("用户并发编辑");
 });
 it("存在 script_sections 时拒绝伪装纯文锚点",async()=>{
  const {artifact,source}=await seed();
  await service.replaceStructuredContent(ctx,artifact.id,source.id,{scriptSections:[{sectionType:"body",content:text,position:0}]});
  await expect(service.applyScriptPatch(ctx,artifact.id,{expectedVersionId:source.id,sectionId:createLegacyScriptRange(text,originalText),expectedOriginalText:originalText,replacementText:"新句"})).rejects.toThrow();
 });
 it("正文优先级与同义字段同步",async()=>{
  const {artifact}=await seed();const source=await service.createVersion(ctx,artifact.id,{contentText:"旧contentText",contentData:{transcript:text,body:"旧body",metadata:123},changeSummary:"混合"});
  expect((await reader()(ctx,"p","output_script"))?.fullText).toBe(text);
  const next=await service.applyScriptPatch(ctx,artifact.id,{expectedVersionId:source.id,sectionId:createLegacyScriptRange(text,originalText),expectedOriginalText:originalText,replacementText:"新句"});
  expect(next.contentText).toBe(text.replace(originalText,"新句"));expect(next.contentData).toMatchObject({transcript:next.contentText,body:next.contentText,metadata:123});
 });
});
describe("纯文范围不可伪造或扩大",()=>{
 it("拒绝重复、空白和整篇",()=>{for(const [whole,part] of [["重复重复","重复"],[text,text],[text," "]])expect(()=>createLegacyScriptRange(whole!,part!)).toThrow();});
 it("拒绝越界、非整数、hash 不符和不精确原文",()=>{
  const ref=createLegacyScriptRange(text,originalText);
  for(const bad of [ref.replace(/:\d+:\d+$/,":0:99999"),ref.replace(/:\d+:\d+$/,":1.5:12"),ref.replace(/:\d+:\d+$/,":0:9007199254740993"),ref.replace(legacyScriptHash(text),"0".repeat(64))])expect(()=>applyLegacyScriptRange(text,bad,originalText,"新句")).toThrow();
  expect(()=>applyLegacyScriptRange(text,ref,originalText+" ","新句")).toThrow();
 });
});
