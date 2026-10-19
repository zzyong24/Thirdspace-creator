import {beforeEach, expect, it} from "vitest";
import type {Endpoint, RequestContext} from "@creatoros/contract";
import {compositeTransport, __resetPersistenceForTests} from "@/server/persistence-client";
import {canonicalDataset} from "@/fixtures/canonical";

const ctx: RequestContext = {userId: canonicalDataset.user.id, accountId: `acct-of-${canonicalDataset.user.id}`, requestId:"creation-idempotency", source:"user"};
async function call(id: string, params: unknown, body?: unknown, context = ctx) {
  return compositeTransport.request({id} as Endpoint, {params, query:undefined, body} as never, context) as Promise<{data:any}>;
}
beforeEach(__resetPersistenceForTests);
it.each(["video", "article", "image"])("%s 同键重试只建一个目标，完整创建输入不同必须冲突", async contentType => {
  const project = (await call("projects.create", undefined, {title:"隔离创建测试", brief:""})).data;
  const body = {title:"第一个标题", contentType, clientRequestId:`creation-${contentType}-same-key`};
  const first = (await call("projects.outputs.create", {projectId:project.id}, body)).data;
  const retry = (await call("projects.outputs.create", {projectId:project.id}, body)).data;
  expect(retry.id).toBe(first.id);
  await expect(call("projects.outputs.create", {projectId:project.id}, {...body, title:"不同标题"})).rejects.toMatchObject({code:"ConflictError"});
  expect((await call("projects.outputs.list", {projectId:project.id})).data).toHaveLength(1);
  await expect(call("projects.outputs.create", {projectId:project.id}, body, {...ctx,accountId:"other-account"})).rejects.toMatchObject({code:"OwnershipError"});
});
it("视频和文章并发同键竞争返回同一个真实 output，且阶段不重复", async () => {
  const project = (await call("projects.create", undefined, {title:"隔离并发测试", brief:""})).data;
  for (const contentType of ["video", "article"]) {
    const results = await Promise.all(Array.from({length:4}, () => call("projects.outputs.create", {projectId:project.id}, {title:"同稿", contentType, clientRequestId:`concurrent-${contentType}-request`})));
    expect(new Set(results.map(result => result.data.id)).size).toBe(1);
  }
  expect((await call("projects.outputs.list", {projectId:project.id})).data).toHaveLength(2);
});
