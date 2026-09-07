import type {LanguageModel} from "ai";
import type {z} from "zod";
import type {chatStructuredNodeSchema} from "@creatoros/contract/execution-worker";
import {getTemplate} from "../prompt/registry";
import {runStructuredNode} from "../nodes/structured-node";

type Node=z.infer<typeof chatStructuredNodeSchema>;
/** 工具身份和已登记 Skill 的协议映射，不做语义判断。 */
export const chatGenerationSkillId=(name:string)=>name==="review.analyze"?"review.insights":name;
/** Worker 执行与宿主无网络回放共用同一序列；每块及结构修复共用原模型调用账本。 */
export async function runChatStructuredSequence(node:Node,model:LanguageModel,maxOutputTokens:number,signal?:AbortSignal):Promise<{object:unknown}>{
 const template=getTemplate(chatGenerationSkillId(node.capability));
 if(node.capability!=="knowledge.distill")return runStructuredNode({model,template,facets:node.facets,maxOutputTokens,signal});
 const parts:unknown[]=[];
 for(const content of node.chunks){
  signal?.throwIfAborted();
  const result=await runStructuredNode({model,template,facets:{content},maxOutputTokens,signal});
  parts.push(result.object);
 }
 return {object:{parts}};
}
