import {eq,executionTasks} from '@creatoros/backend';
import {createExecutionRoute,inheritExecutionRoute} from '@creatoros/contract/execution-worker';
import {requireWorkspace} from "../../workspace-scope";
import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import {requireAccountId,type Db} from "@creatoros/backend";
import {createAiService,type CreateTaskInput,type ServiceDeps} from "./ai.service";
import {createAiRepository} from "./ai.repository";
import {AttemptIdInvalidError,ConflictError,ReservedInputFieldError} from "./ai.errors";
import {canonicalJson} from "./canonical-json";

type Transaction=Parameters<Parameters<Db["transaction"]>[0]>[0];
const bindingSchema=z.object({
 executionTaskId:z.string().min(1),callId:z.string().min(1),inputDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();
export type AiTaskCommitBinding=z.infer<typeof bindingSchema>;
export interface PreparedAiTaskCommit {
 /** 仅限宿主命名端口：调用方必须在同一事务里核对父租约并写入工具回执。 */
 commit(tx:Transaction,binding:AiTaskCommitBinding):ReturnType<ReturnType<typeof createAiService>["createTask"]>;
}

/** 配置读取与数据库提交分离；准备阶段不创建任务或执行模型。 */
export async function prepareAiTaskCommit(deps:ServiceDeps,ctx:RequestContext,input:CreateTaskInput & {attemptId:string}):Promise<PreparedAiTaskCommit>{
 const context=structuredClone(ctx),body=structuredClone(input);
 requireWorkspace(context);const accountId=context.accountId??null;
 if(typeof body.attemptId!=="string" || body.attemptId.length<16 || body.attemptId.length>128)throw new AttemptIdInvalidError();
 const inputData=body.inputData??{};
 const reserved=["skillSnapshot","platformPolicy","executionRoute"].filter(key=>Object.prototype.hasOwnProperty.call(inputData,key));
 if(reserved.length)throw new ReservedInputFieldError(reserved);
 // 准备只固定输入/Skill；不按当下偏好冻结子图。真正路由在原父事务commit时继承。
 const runtimeData=structuredClone(await deps.resolveTaskRuntimeData?.(structuredClone(context),body.taskType,Object.freeze(structuredClone(inputData)),createExecutionRoute('pi','parent'))??{});
 return {async commit(tx,rawBinding){
  const binding=bindingSchema.parse(rawBinding);
  const txDb=tx as unknown as Db;
  const [parent]=await tx.select().from(executionTasks).where(eq(executionTasks.id,binding.executionTaskId));
  if(!parent||parent.userId!==context.userId||parent.groupId!==(context.groupId??null)||parent.accountId!==(context.accountId??null))throw new ConflictError('父执行归属不符');
  const payload=parent.payload as Record<string,unknown>,modelInput=payload.modelInput as Record<string,unknown>|undefined;
  const inherited=inheritExecutionRoute(payload,modelInput?.executionEngine==='codex'?'codex':'pi');
  const selected=structuredClone(runtimeData);
  if(inherited.schemaVersion===1&&inherited.engine==='codex'){delete selected.modelAuthority;delete selected.modelAuthorityDigest;}
  const service=createAiService({...deps,db:txDb,resolveTaskRuntimeData:async()=>({...selected,executionRoute:inherited,hostTaskSubmission:binding})});
  const task=await service.createTask(context,structuredClone(body));
  const row=await createAiRepository(txDb,{now:deps.now,nextId:deps.nextId,userId:context.userId,accountId,groupId:context.groupId,membershipVersion:context.membershipVersion}).requireTask(task.id);
  // SEMANTIC_BOUNDARY_ALLOW:提交来源精确相等是事务幂等校验，不判断内容语义。
  if(canonicalJson((row.runtimeData as Record<string,unknown>).hostTaskSubmission)!==canonicalJson(binding))throw new ConflictError("任务提交来源与父调用不符，不能接管原任务");
  return task;
 }};
}
