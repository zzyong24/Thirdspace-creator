import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generationRequestDigest, replayTextGeneration, replayStructuredGeneration, type GenerationReplayReceipt } from "./generation-replay";
const identity = { modelId: "frozen-model", provider: "openai.chat" };
const text = { ...identity, system: "原系统提示", prompt: "原用户输入", maxOutputTokens: 1024 };
const schema = z.object({ value: z.string() });
const node = { template: { id: "test.replay", version: "1", system: "系统", template: "{{input}}", requiredFacets: ["input"], outputSchema: schema }, facets: { input: "冻结输入" }, outputSchema: schema, maxOutputTokens: 1024 };
function settled(request: Record<string, unknown>, content: string): GenerationReplayReceipt {
  return { inputDigest: generationRequestDigest(request), status: "settled", providerResult: { content: [{type:"text",text:content}], finishReason:{unified:"stop"}, usage:{inputTokens:{total:4},outputTokens:{total:3}}, warnings:[] } };
}
async function first() {
  const result = await replayStructuredGeneration({ ...identity, receipts: [] }, node);
  if (result.status !== "next-request") throw new Error("expected request");
  return result.request;
}
describe("无网络生成节点回放", () => {
  it("从原文本节点推导真实请求，再由已结算回执重建结果", async () => {
    const first = await replayTextGeneration({ ...text, receipts: [] });
    expect(first.status).toBe("next-request");
    if (first.status !== "next-request") return;
    expect(first.request).toMatchObject({ modelId:identity.modelId,provider:identity.provider,maxOutputTokens:1024 });
    expect(JSON.stringify(first.request)).not.toMatch(/headers|abortSignal/);
    const replay = await replayTextGeneration({ ...text, receipts: [settled(first.request,"确认返回文本")] });
    expect(replay).toMatchObject({status:"complete",consumed:1,value:{text:"确认返回文本"}});
  });
  it("原生结构化成功只消耗原回执，不生成第二次请求", async () => {
    const request = await first();
    expect(request.responseFormat).toMatchObject({type:"json"});
    const result = await replayStructuredGeneration({...identity,receipts:[settled(request,'{"value":"原生成功"}')]},node);
    expect(result).toMatchObject({status:"complete",consumed:1,value:{object:{value:"原生成功"}}});
  });
  it("明确协议拒绝由原节点推导文本降级请求，两个回执完成同一节点", async () => {
    const request = await first();
    const refusal: GenerationReplayReceipt = {inputDigest:generationRequestDigest(request),status:"rejected",rejectionCode:"STRUCTURED_PROTOCOL_UNSUPPORTED"};
    const fallback = await replayStructuredGeneration({...identity,receipts:[refusal]},node);
    expect(fallback).toMatchObject({status:"next-request",consumed:1});
    if(fallback.status!=="next-request")return;
    expect(fallback.request.responseFormat).toBeUndefined();
    const result = await replayStructuredGeneration({...identity,receipts:[refusal,settled(fallback.request,'{"value":"文本成功"}')]},node);
    expect(result).toMatchObject({status:"complete",consumed:2,value:{object:{value:"文本成功"}}});
  });
  it("原回执带 fenced JSON 时，沿原节点解析，不强行补发请求", async () => {
    const request = await first();
    const result = await replayStructuredGeneration({...identity,receipts:[settled(request,'```json\n{"value":"旧文本可解析"}\n```')]},node);
    expect(result).toMatchObject({status:"complete",consumed:1,value:{object:{value:"旧文本可解析"}}});
  });
  it.each(["unknown","rejected"] as const)("%s 不能冒充可回放的成功或协议降级",async status=>{
    const request=await first();
    await expect(replayStructuredGeneration({...identity,receipts:[{inputDigest:generationRequestDigest(request),status}]},node)).rejects.toThrow("REQUIRES_RECONCILIATION");
  });
  it("提示词或模型身份改变时拒绝消费旧回执",async()=>{
    const request=await first(),receipts=[settled(request,'{"value":"原结果"}')];
    await expect(replayStructuredGeneration({...identity,modelId:"changed",receipts},node)).rejects.toThrow("REQUEST_MISMATCH");
    await expect(replayStructuredGeneration({...identity,receipts},{...node,facets:{input:"篡改输入"}})).rejects.toThrow("REQUEST_MISMATCH");
  });
  it("多余回执不能被忽略，已取消回放不推进",async()=>{
    const request=await first(),receipt=settled(request,'{"value":"结果"}');
    await expect(replayStructuredGeneration({...identity,receipts:[receipt,receipt]},node)).rejects.toThrow("UNUSED_RECEIPTS");
    await expect(replayStructuredGeneration({...identity,receipts:[],signal:AbortSignal.abort()},node)).rejects.toThrow();
  });
});

it("修复请求只能由原完成策略和已结算对象推导，篡改的修复回执不被消费", async () => {
  const { registerOfficialCompletionPolicyAdapter, runWithEffectiveSkillSnapshot } = await import("../index");
  const id = "test.replay-repair";
  registerOfficialCompletionPolicyAdapter({id,version:"1",supportsSchema:()=>true,toSegments:value=>(value as {segments:Array<{role?:string}>}).segments});
  const snapshot = {
    snapshotVersion:1 as const,userId:"u",accountId:"a",resolvedAt:"2026-09-06T00:00:00.000Z",platformPolicyVersion:"1",platformPolicy:"只产候选",
    skills:[{skillId:id,baseVersion:"1",overlayRevision:1,overlayVersion:"1",effective:{methodSystem:"系统",template:"{{input}}",tools:[],requiredFacets:["input"],contextRequirements:[],
      outputSchema:{type:"object",properties:{segments:{type:"array",items:{type:"object",properties:{role:{type:"string"}},required:["role"]}}},required:["segments"]},
      completionPolicy:{schemaVersion:1 as const,minSegments:2,maxSegments:null,requiredSequence:[],repairAttempts:1},completionPolicyAdapter:{id,version:"1"},
    }}],
  };
  const repairNode = { template:{id,version:"1",system:"系统",template:"{{input}}",requiredFacets:["input"]},facets:{input:"原输入"},maxOutputTokens:1024 };
  await runWithEffectiveSkillSnapshot(snapshot,async()=>{
    const first=await replayStructuredGeneration({...identity,receipts:[]},repairNode);
    if(first.status!=="next-request")throw new Error("expected request");
    const initial=settled(first.request,'{"segments":[{"role":"现有段落"}]}');
    const repair=await replayStructuredGeneration({...identity,receipts:[initial]},repairNode);
    expect(repair).toMatchObject({status:"next-request",consumed:1});
    if(repair.status!=="next-request")return;
    expect(JSON.stringify(repair.request.prompt)).toContain("现有段落");
    expect(generationRequestDigest(repair.request)).not.toBe(initial.inputDigest);
    const complete=await replayStructuredGeneration({...identity,receipts:[initial,settled(repair.request,'{"segments":[{"role":"现有段落"},{"role":"补充段落"}]}')]},repairNode);
    expect(complete).toMatchObject({status:"complete",consumed:2,value:{object:{segments:[{role:"现有段落"},{role:"补充段落"}]}}});
    const forged=settled({...repair.request,prompt:[{role:"user",content:"伪造修复指令"}]},'{"segments":[{},{}]}');
    await expect(replayStructuredGeneration({...identity,receipts:[initial,forged]},repairNode)).rejects.toThrow("REQUEST_MISMATCH");
  });
});


it("仅已确认坏输出可投影为节点失败，未知、篡改和多余回执仍拒绝", async () => {
  const initial=await replayStructuredGeneration({...identity,structuredOutputMode:"text",receipts:[]},node);
  if(initial.status!=="next-request")throw new Error("expected text request");
  const request=initial.request;
  const bad=settled(request,'{"wrong":true}');
  expect(await replayStructuredGeneration({...identity,structuredOutputMode:"text",captureNodeFailure:true,receipts:[bad]},node)).toEqual({status:"failed",consumed:1});
  for(const status of ["unknown","rejected"] as const){
    await expect(replayStructuredGeneration({...identity,structuredOutputMode:"text",captureNodeFailure:true,receipts:[{...bad,status}]},node)).rejects.toThrow("REQUIRES_RECONCILIATION");
  }
  await expect(replayStructuredGeneration({...identity,structuredOutputMode:"text",captureNodeFailure:true,receipts:[{...bad,inputDigest:"forged"}]},node)).rejects.toThrow("REQUEST_MISMATCH");
  await expect(replayStructuredGeneration({...identity,structuredOutputMode:"text",captureNodeFailure:true,receipts:[bad,bad]},node)).rejects.toThrow();
  await expect(replayStructuredGeneration({...identity,structuredOutputMode:"text",captureNodeFailure:true,receipts:[bad],signal:AbortSignal.abort()},node)).rejects.toThrow();
});
