import {workspaceFilter} from "../../workspace-scope";
import {and,eq,aiTasks} from "@creatoros/backend";
import {structuredGenerationInputSchema,coverImagePreparationSchema} from "@creatoros/contract/execution-worker";
import {generationRequestDigest} from "@creatoros/ai-worker/chat";
import {createExecutionLeaseService} from "./execution-lease.service";
import {ConflictError} from "./execution.errors";
export type CoverScope=Parameters<Parameters<ReturnType<typeof createExecutionLeaseService>["withLease"]>[2]>[0];
export async function bindCoverExecution({tx,task,context}:CoverScope){
 const payload=task.payload as Record<string,unknown>,input=structuredGenerationInputSchema.parse(payload.modelInput);
 const [business]=await tx.select().from(aiTasks).where(and(eq(aiTasks.id,task.ownerId),eq(aiTasks.executionTaskId,task.id),eq(aiTasks.userId,context.userId),workspaceFilter(aiTasks,context)));
 const paired=(business?.taskType==="cover.generate"&&input.skillId==="cover.brief")||(business?.taskType==="graphic.card.generate"&&input.skillId==="graphic.card-brief");
 if(task.kind!=="ai_task"||task.ownerType!=="ai_task"||payload.aiTaskId!==business?.id||!paired||input.capability!=="copy.generate"||input.skillSnapshot.userId!==context.userId||input.skillSnapshot.accountId !== (context.accountId??null) || (input.skillSnapshot.groupId??null)!==(context.groupId??null))throw new ConflictError("封面缺少真实任务与当前账号绑定");
 if(input.facets.__coverTaskInputDigest!==generationRequestDigest({inputData:business.inputData,projectId:business.projectId}))throw new ConflictError("封面原业务输入已变化");
 const sourceDigest=generationRequestDigest({input});
 return {input,business,payload,sourceDigest};
}
export async function readCoverImageBinding(scope:CoverScope){
 const state=await bindCoverExecution(scope);
 const saved=state.payload.coverImage as {sourceDigest?:unknown;value?:unknown}|undefined;
 if(saved?.sourceDigest!==state.sourceDigest)throw new ConflictError("封面图片缺少原文案准备证据");
 const value=coverImagePreparationSchema.parse(saved.value);
 if(value.input.operationKey!==`${state.input.operationKey}/image` || value.input.mediaKind!=="image" || value.input.capability!==(value.reference?"image.edit":"image.generate"))throw new ConflictError("封面图片能力与原准备不符");
 return {...state,...value};
}
