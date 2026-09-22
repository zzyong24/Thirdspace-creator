import {z} from "zod";
import {defineEndpoint} from "../endpoints";
import {id} from "../primitives";
import {executionTaskResourceV2,executionTaskStatusV2} from "../resources/intelligence";
import {workbenchArtifactSchema,workbenchCapabilitySchema,workbenchPlanSchema,workbenchArtifactVersionsRequestSchema} from "../internal/agent-workbench";
import {executionStreamChunkSchema,readExecutionStreamSchema} from "../internal/execution-stream";

const taskParams=z.object({taskId:id}).strict();
const artifactParams=taskParams.extend({artifactId:id,version:z.number().int().positive()});
const conversationParams=z.object({conversationId:id}).strict();
const format=z.enum(["raw","preview","png","pdf"]);
const fr=["FR-EXECUTION-TASKS"];
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const diagnostics=z.object({schemaVersion:z.literal(1),status:z.enum(["analyzed","unavailable","not_applicable"]),sourceHash:hash,scriptCount:z.number().int().nonnegative(),externalResourceCount:z.number().int().nonnegative(),staticSvgCount:z.number().int().nonnegative(),staticTableCount:z.number().int().nonnegative(),staticImgCount:z.number().int().nonnegative(),degraded:z.boolean(),repairAdvice:z.array(z.string())}).strict();
const lineage=z.object({artifactId:id,currentVersion:z.number().int().nonnegative(),status:z.string(),pendingOperationId:z.string().nullable(),lastOperationId:z.string().nullable(),lastErrorCode:z.string().nullable(),migrationReason:z.string().nullable()}).strict();

export const workbenchOperations={
  inspectWorkbenchTask:defineEndpoint({id:"workbench.tasks.inspect",method:"GET",path:"/workbench/tasks/:taskId",params:taskParams,
    query:z.object({afterSequence:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(100).default(50)}).strict(),
    response:z.object({task:executionTaskResourceV2,conversationId:id.nullable(),sourceMessageId:id.nullable(),frozenCapabilities:z.array(workbenchCapabilitySchema),frozenTools:z.array(z.object({name:z.string(),version:z.string(),effect:z.string().nullable(),execution:z.string().nullable()}).strict()),plan:workbenchPlanSchema.nullable(),calls:z.array(z.object({
      id,sequence:z.number().int(),kind:z.string(),finishReason:z.string().nullable(),proposedTools:z.array(z.object({toolCallId:z.string().nullable(),toolName:z.string().nullable(),inputText:z.string().nullable(),inputTruncated:z.boolean(),invalid:z.boolean()}).strict()),toolName:z.string().nullable(),inputText:z.string().nullable(),inputTruncated:z.boolean(),operationKey:z.string(),parentCallId:z.string().nullable(),retryOfCallId:z.string().nullable(),status:z.string(),
      startedAttempt:z.number().int().nullable(),totalTokens:z.number().int().nullable(),rejectionCode:z.string().nullable(),resultRef:z.string().nullable(),
      resultText:z.string().nullable(),resultTruncated:z.boolean(),createdAt:z.string(),updatedAt:z.string(),
    }).strict()),nextSequence:z.number().int(),hasMore:z.boolean()}).strict(),fr}),
  readWorkbenchEvents:defineEndpoint({id:"workbench.tasks.events",method:"GET",path:"/workbench/tasks/:taskId/events",params:taskParams,query:readExecutionStreamSchema,
    response:z.object({events:z.array(z.object({sequence:z.number().int(),callId:id,callIndex:z.number().int(),chunk:executionStreamChunkSchema}).strict()),nextSequence:z.number().int(),hasMore:z.boolean(),status:z.union([executionTaskStatusV2,executionTaskResourceV2.shape.runtimeStatus.unwrap()]),attempt:z.number().int()}).strict(),fr}),
  listWorkbenchCapabilities:defineEndpoint({id:"workbench.capabilities.list",method:"GET",path:"/workbench/capabilities",
    response:z.object({platform:z.enum(["macos","windows","linux"]).nullable(),capabilities:z.array(workbenchCapabilitySchema),builtins:z.array(z.object({id,version:z.string(),platforms:z.array(z.string()),capability:z.string(),dependencies:z.array(z.object({id,version:z.string()})),tools:z.array(z.object({name:z.string(),effect:z.string()}))})),dependencyLock:z.record(z.string(),z.string())}).strict(),fr}),
  listWorkbenchArtifacts:defineEndpoint({id:"workbench.artifacts.list",method:"GET",path:"/workbench/conversations/:conversationId/artifacts",params:conversationParams,query:workbenchArtifactVersionsRequestSchema,
    response:z.object({items:z.array(workbenchArtifactSchema.extend({status:z.literal("ready")})),legacyItems:z.array(workbenchArtifactSchema.extend({status:z.literal("legacyReadOnly")})),nextCursor:z.string().nullable(),lineages:z.array(lineage)}).strict(),fr}),
  readWorkbenchArtifact:defineEndpoint({id:"workbench.artifacts.read",method:"GET",path:"/workbench/tasks/:taskId/artifacts/:artifactId/:version",params:artifactParams,
    query:z.object({offset:z.number().int().nonnegative().default(0),limit:z.number().int().min(1).max(128000).default(128000)}).strict(),
    response:z.object({metadata:workbenchArtifactSchema,total:z.number().int().nonnegative(),offset:z.number().int().nonnegative(),nextOffset:z.number().int().nullable(),encoding:z.literal("base64"),data:z.string()}).strict(),fr}),
  renderWorkbenchArtifact:defineEndpoint({id:"workbench.artifacts.render",method:"GET",path:"/workbench/tasks/:taskId/artifacts/:artifactId/:version/render",params:artifactParams,query:z.object({format:format.default("preview")}).strict(),
    response:z.object({metadata:workbenchArtifactSchema,rendererPolicy:z.string(),diagnostics,format,mime:z.string(),filename:z.string(),size:z.number().int().nonnegative(),hash,sourceHash:hash,encoding:z.literal("base64"),data:z.string()}).strict(),fr}),
  reconcileWorkbenchArtifact:defineEndpoint({id:"workbench.artifacts.reconcile",method:"POST",path:"/workbench/conversations/:conversationId/artifacts/reconcile",params:conversationParams,
    body:z.object({operationId:id}).strict(),response:z.object({artifactId:id,status:z.string(),lastErrorCode:z.string().nullable()}).strict(),fr}),
  reconcileWorkbenchFile:defineEndpoint({id:"workbench.files.reconcile",method:"POST",path:"/workbench/tasks/:taskId/files/reconcile",params:taskParams,
    body:z.object({operationId:id}).strict(),response:z.object({taskId:id,operationId:id,status:z.enum(["settled","unknown"]),
      verificationKind:z.literal("native_receipt").nullable(),version:z.number().int().nonnegative().nullable(),
      hash:z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),size:z.number().int().nonnegative().nullable()}).strict(),fr}),
} as const;
