import {describe,expect,it} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {assembleCreativeContext} from "./creative-context";
import {buildKnowledgeCatalog,readKnowledgeCatalogFacet,resolveKnowledgeSources,KNOWLEDGE_CATALOG_FACET} from "./knowledge-sources";
import {projectScriptDraftCandidate,type ScriptDraftProjectionInput} from "./script-candidate-projection";
const ctx:RequestContext={userId:"u1",requestId:"r1",source:"user"};
const catalog=[{knowledgeId:"k1",title:"选题先问三个问题"},{knowledgeId:"k2",title:"开头三秒给结果"}];
describe("第三批步骤3：知识来源回传",()=>{
 it("装配上下文时冻结本次注入的知识目录；没有 ID 的旧 fake 行不进目录",async()=>{
  const context=await assembleCreativeContext(ctx,{projectId:null,topic:""},{
   positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},
   knowledge:{list:async()=>[{id:"k1",title:"选题先问三个问题",knowledgeType:"claim"},{title:"无ID旧行",knowledgeType:"claim"}]},
  });
  expect(context.knowledgeBrief).toContain("选题先问三个问题");
  expect(context.knowledgeCatalog).toEqual([{knowledgeId:"k1",title:"选题先问三个问题"}]);
 });
 it("只认冻结目录里的标题（含截断前缀）；编造或目录外的标题丢弃，并去重",()=>{
  expect(resolveKnowledgeSources(["选题先问三个问题","编造的来源","开头三秒…","选题先问三个问题"],catalog)).toEqual(catalog);
  expect(resolveKnowledgeSources(["开头…"],catalog)).toEqual([]);
  expect(resolveKnowledgeSources(undefined,catalog)).toEqual([]);
  expect(resolveKnowledgeSources(["选题先问三个问题"],[])).toEqual([]);
 });
 it("冻结 facet 缺失或损坏时按旧任务处理为空",()=>{
  expect(readKnowledgeCatalogFacet({})).toEqual([]);
  expect(readKnowledgeCatalogFacet({[KNOWLEDGE_CATALOG_FACET]:"{坏"})).toEqual([]);
  expect(readKnowledgeCatalogFacet({[KNOWLEDGE_CATALOG_FACET]:JSON.stringify(buildKnowledgeCatalog([{id:"k1",title:" 选题先问三个问题 "}]))})).toEqual([catalog[0]]);
 });
 it("脚本候选有来源才写 knowledgeSources 键，旧结果逐字不变",()=>{
  const base={artifactId:"art",accountId:"a",shots:[{role:"hook",口播:"一句",画面:"画",字幕:"字",时长:"0-3s"}],generation:{finishReason:"stop",usage:{inputTokens:1,outputTokens:1,cachedTokens:0,totalTokens:2},attempts:[]},
   validation:{status:"passed",errors:[],policySnapshot:{policy:{schemaVersion:1,minSegments:1,maxSegments:null,requiredSequence:[],repairAttempts:0},adapter:{id:"script.draft.shots",version:"1"}},originalSegmentCount:1,finalSegmentCount:1,repairAttemptsUsed:0,repairReasons:[]},
   effectiveSkill:{skillId:"script.draft",baseVersion:"v12",overlayRevision:null,overlayVersion:null},pipelineMetadata:{},sourceMetadata:[]} as unknown as ScriptDraftProjectionInput;
  expect(projectScriptDraftCandidate(base).resultData).not.toHaveProperty("knowledgeSources");
  expect(projectScriptDraftCandidate({...base,knowledgeSources:[catalog[0]!]}).resultData).toMatchObject({knowledgeSources:[catalog[0]]});
 });
});
