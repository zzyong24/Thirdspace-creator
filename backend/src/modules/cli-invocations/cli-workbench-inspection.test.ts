import {afterAll, beforeAll, expect, it, vi} from "vitest";
import type {z} from "zod";
import {ENDPOINTS, type Endpoint, type EndpointInput, type RequestContext} from "@creatoros/contract";
import {createDb, executionCalls, executionTasks, executionStreamEvents, type Db} from "@creatoros/backend";
import {accountGroups} from "../../schema/account-groups";
import {cliInvocations} from "../../schema/cli-invocations";
import {createCliInvocationService} from "./cli-invocations.service";
import {createWorkbenchPublicService} from "../execution/workbench-public.service";
import {createWorkbenchPublicTransport} from "../execution/workbench-public.transport";
import {createExecutionStreamService} from "../execution/execution-stream.service";

let db: Db, close: () => Promise<void>;
let gateway: ReturnType<typeof createCliInvocationService>, transport: ReturnType<typeof createWorkbenchPublicTransport>;
const group: RequestContext = {userId:"inspection-owner", groupId:"inspection-group", accountId:null, requestId:"inspection-request", source:"user"};
const noFiles = vi.fn(async () => { throw Error("诊断不得触发文件操作"); });
const endpoints = [ENDPOINTS.inspectWorkbenchTask, ENDPOINTS.readWorkbenchEvents] as const;

beforeAll(async () => {
  const opened = await createDb(); db = opened.db; close = () => opened.client.close();
  const stamp = new Date().toISOString(); let sequence = 0;
  await db.insert(accountGroups).values(["inspection-group", "inspection-other", "inspection-archived"].map(id => ({id, userId:group.userId, name:id, status:id.endsWith("archived") ? "archived" : "active", createdAt:stamp, updatedAt:stamp})));
  await db.insert(executionTasks).values([
    {id:"inspection-task", groupId:group.groupId, accountId:null},
    {id:"inspection-archived-task", groupId:"inspection-archived", accountId:null},
    {id:"inspection-legacy-task", groupId:null, accountId:"inspection-account"},
  ].map(scope => ({...scope, userId:group.userId, kind:"ai_task", ownerType:"ai_task", ownerId:scope.id, status:"queued", idempotencyKey:scope.id, payload:{privatePayload:"do-not-expose"}, createdAt:stamp, updatedAt:stamp})));
  await db.insert(executionCalls).values([1,2].map(sequence => ({id:`inspection-call-${sequence}`, executionTaskId:"inspection-task", sequence, operationKey:`inspection-call-${sequence}`, kind:"model", inputDigest:"a".repeat(64), status:"settled", reservedTokens:0, resultText:"private-model-body", providerResult:{apiKey:"private-provider-key"}, createdAt:stamp, updatedAt:stamp})));
  await db.insert(executionStreamEvents).values([1,2].map(sequence => ({executionTaskId:"inspection-task", sequence, callId:`inspection-call-${sequence}`, callIndex:0, chunk:{type:"text-delta",id:"text",delta:`part-${sequence}`}, createdAt:stamp})));
  gateway = createCliInvocationService({db, masterKey:Buffer.alloc(32, 11), now:() => stamp, nextId:prefix => `${prefix}-${++sequence}`});
  transport = createWorkbenchPublicTransport({tasks:createWorkbenchPublicService(db), stream:createExecutionStreamService(db), artifacts:{} as Parameters<typeof createWorkbenchPublicTransport>[0]["artifacts"], capabilities:vi.fn(), render:noFiles, reconcile:noFiles});
},120000);
afterAll(async () => close?.());

// 模拟公开 dispatcher 的两个真实边界；不替换权限、任务归属、分页与 DTO。
async function read<E extends Endpoint>(endpoint:E, input:EndpointInput<E>, ctx:RequestContext = group):Promise<z.output<E["response"]>> {
  const begun = await gateway.begin(ctx, {operation:endpoint.id, effect:"read", clientId:"inspection-cli", idempotencyKey:null, inputHash:JSON.stringify(input), targetRefs:[]});
  if (begun.kind !== "execute") throw Error("读取应创建真实审计");
  const result = await transport.request(endpoint, input, ctx);
  await gateway.succeed(begun.invocationId, result);
  return endpoint.response.parse((result as {data:unknown}).data) as z.output<E["response"]>;
}

it("纯组 CLI 任务与事件分页成功，保留来源且不暴露私密字段", async () => {
  const input = {params:{taskId:"inspection-task"}, query:{afterSequence:0,limit:1}, body:undefined};
  const first = await read(ENDPOINTS.inspectWorkbenchTask,input);
  expect(first.task).toMatchObject({id:"inspection-task",groupId:group.groupId,accountId:null});
  expect(first.calls.map(call => call.sequence)).toEqual([1]); expect(first.hasMore).toBe(true);
  const next = await read(ENDPOINTS.inspectWorkbenchTask,{...input,query:{afterSequence:first.nextSequence,limit:1}});
  expect(next.calls.map(call => call.sequence)).toEqual([2]); expect(next.hasMore).toBe(false);
  const eventPage = await read(ENDPOINTS.readWorkbenchEvents,input);
  expect(eventPage.events.map(event => event.sequence)).toEqual([1]); expect(eventPage.hasMore).toBe(true);
  const last = await read(ENDPOINTS.readWorkbenchEvents,{...input,query:{afterSequence:eventPage.nextSequence,limit:1}});
  expect(last.events.map(event => event.sequence)).toEqual([2]); expect(last.hasMore).toBe(false);
  for (const value of [first,next,eventPage,last]) {
    expect(JSON.stringify(value)).not.toMatch(/privatePayload|do-not-expose|private-model-body|private-provider-key|fenceToken|apiKey/);
  }
  expect(await db.select().from(cliInvocations)).toHaveLength(4);
  for (const row of await db.select().from(cliInvocations)) expect(row).toMatchObject({accountScope:"group:inspection-group",accountId:null,effect:"read",status:"succeeded"});
});

it.each(endpoints)("$id 拒绝跨用户/跨组/缺任务，保留归档只读和旧账号入口", async endpoint => {
  const input = {params:{taskId:"inspection-task"},query:{afterSequence:0,limit:1},body:undefined};
  for (const ctx of [{...group,userId:"another-user"},{...group,groupId:"inspection-other"},{...group,groupId:"missing-group"},{...group,groupId:null,accountId:null}]) await expect(read(endpoint,input,ctx)).rejects.toThrow();
  await expect(read(endpoint,{...input,params:{taskId:"missing-task"}})).rejects.toThrow();
  await expect(read(endpoint,{...input,params:{taskId:"inspection-archived-task"}},{...group,groupId:"inspection-archived"})).resolves.toBeDefined();
  await expect(read(endpoint,{...input,params:{taskId:"inspection-legacy-task"}},{...group,groupId:null,accountId:"inspection-account"})).resolves.toBeDefined();
  await expect(read(endpoint,{...input,params:{taskId:"inspection-legacy-task"}},{...group,groupId:null,accountId:"wrong-account"})).rejects.toThrow();
  expect(noFiles).not.toHaveBeenCalled();
});
