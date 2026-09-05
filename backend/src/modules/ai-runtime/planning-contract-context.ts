import type {RequestContext} from "@creatoros/contract";
import {contractSchema,PLANNING_CONTRACT_SLOTS} from "@creatoros/ai-worker";
import type {RecordCandidateInput} from "../ai/ai.service";
import {assembleCreativeContext,type ContextDeps} from "./creative-context";

export interface PlanningContractContextDeps extends ContextDeps {
  /** 正式装配必须验证真实owner/project/content_contract类型；旧runner最小组合保留兼容。 */
  assertTargetArtifact?:(ctx:RequestContext,target:{artifactId:string;projectId:string|null})=>Promise<void>;
}
function requireArtifactId(inputData:Record<string,unknown>):string{
  const id=typeof inputData.artifactId==="string"?inputData.artifactId:"";
  if(!id)throw new Error("planning-contract-runner: inputData.artifactId is required");
  return id;
}

/** 后端只准备真实上下文，由执行权服务冻结；不调用模型、不新建目标工件。 */
export async function preparePlanningContractContext(
  ctx:RequestContext,task:{projectId:string|null;inputData:Record<string,unknown>},deps:PlanningContractContextDeps,
):Promise<Record<string,string>>{
  const artifactId=requireArtifactId(task.inputData);
  await deps.assertTargetArtifact?.(ctx,{artifactId,projectId:task.projectId});
  const topic=typeof task.inputData.topic==="string"?task.inputData.topic:"";
  const context=await assembleCreativeContext(ctx,{projectId:task.projectId,topic},deps);
  return {
    positioning:context.positioningBrief || "（创作者尚未设置定位——按通用爆款逻辑产内容合同）",
    learnings:context.learningsBrief?`\n【过往复盘爆款要素】\n${context.learningsBrief}`:"",
    topic:context.topic.title?`\n【本期选题】${context.topic.title}${context.topic.angle?`（切入：${context.topic.angle}）`:""}`:"",
  };
}

/** 固定协议投影，保留旧标题/id兼容与非空子集；仅返回待采纳artifact_version。 */
export function projectPlanningContractCandidate(inputData:Record<string,unknown>,object:unknown):RecordCandidateInput{
  const artifactId=requireArtifactId(inputData);
  const parsed=contractSchema.parse(object);
  const cards=PLANNING_CONTRACT_SLOTS.map(({id,title})=>({id,title,body:parsed[title]?.trim() || parsed[id]?.trim() || ""})).filter(card=>card.body.length>0);
  if(!cards.length)throw new Error("planning-contract-runner: agent returned no parseable contract cards");
  const lines=["# 内容合同",""];
  for(const card of cards)lines.push(`## ${card.title}`,card.body,"");
  return {resultType:"artifact_version",artifactId,resultData:{body:lines.join("\n").trimEnd(),summary:"AI 内容合同草稿",cards,contentData:{cards}}};
}
