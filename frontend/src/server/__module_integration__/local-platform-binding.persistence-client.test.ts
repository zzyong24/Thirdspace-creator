import {createHash} from "node:crypto";
import {join} from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { canonicalDataset } from "@/fixtures/canonical";

const stub = vi.hoisted(() => ({ sequence: 0, repeatXhsIdentity: false,
  root: `/tmp/creatoros-platform-binding-${process.pid}` }));
vi.mock("@creatoros/ai-worker/platform/xhs-browser-source", () => ({
  xhsProfilePaths: (root: string,userId:string,bindAttemptId:string,identity?:string)=>{const hash=(value:string)=>createHash('sha256').update(value).digest('hex');const base=join(root,'xiaohongshu',hash(userId));return {temporary:join(base,'pending',hash(bindAttemptId)),permanent:identity?join(base,'accounts',hash(identity)):null};},
  loginXhsCreator: async (directory: string,_signal?:AbortSignal,controls?:{onStopped?:()=>Promise<void>}) => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(directory, { recursive: true });await controls?.onStopped?.();
    if (!stub.repeatXhsIdentity) stub.sequence += 1;
    return { platformIdentity: `account_000${stub.sequence}`, displayName: "测试账号",
      redId: null, source: "/api/galaxy/user/info" };
  },
  promoteXhsProfile: async (temporary: string, permanent: string) => {
    const { mkdir, rename } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(permanent), { recursive: true });
    await rename(temporary, permanent);
  },
  collectXhsCreatorCatalog: async (_directory: string, identity: string,_signal?:AbortSignal,controls?:{onStopped?:()=>Promise<void>}) => {
    await controls?.onStopped?.();
    const observedAt = new Date().toISOString();
    const page = { requestCursor: null, nextCursor: null, reportedTotal: 1, observedAt,
      responseDigest: `sha256:${identity}`,
      records: [{ externalId: `note_${identity.slice(-4)}`, title: "真实页替身作品", kind: "video",
        publishedAt: observedAt, visibility: { visibility: "unknown",
          source: "/api/galaxy/v2/creator/note/user/posted", observedAt },
        source: "/api/galaxy/v2/creator/note/user/posted", observedAt,
        counts: { view_count: 0, likes: 3, comments_count: null, collected_count: 2, shared_count: 1 } }] };
    const scan = { pages: [page], terminalEvidence: { kind: "platformHasMoreFalse",
      source: "/api/galaxy/v2/creator/note/user/posted", observedAt } };
    return [scan, scan];
  },
}));
vi.mock("@creatoros/ai-worker/platform/kuaishou-browser-source", () => ({
  kuaishouProfilePaths: (root: string,userId:string,bindAttemptId:string,identity?:string)=>{const hash=(value:string)=>createHash('sha256').update(value).digest('hex');const base=join(root,'kuaishou',hash(userId));return {temporary:join(base,'pending',hash(bindAttemptId)),permanent:identity?join(base,'accounts',hash(identity)):null};},
  loginKuaishouCreator: async (directory: string,controls?:{onStopped?:()=>Promise<void>}) => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(directory, { recursive: true });await controls?.onStopped?.();
    stub.sequence += 1;
    return { platformIdentity: `ks_000${stub.sequence}`, displayName: "快手测试账号",
      kwaiId: null, followerCount: 0, source: "/rest/cp/creator/pc/home/infoV2" };
  },
  promoteKuaishouProfile: async (temporary: string, permanent: string) => {
    const { mkdir, rename } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(permanent), { recursive: true });
    await rename(temporary, permanent);
  },
  readKuaishouCreatorIdentity: async (_directory: string, identity: string,controls?:{onStopped?:()=>Promise<void>}) => {await controls?.onStopped?.();return ({
    platformIdentity: identity, displayName: "快手测试账号", kwaiId: null, followerCount: 0,
    source: "/rest/cp/creator/pc/home/infoV2",
  });},
  collectKuaishouCreatorCatalog: async (_directory: string, identity: string,controls?:{onStopped?:()=>Promise<void>}) => {
    await controls?.onStopped?.();
    const observedAt = new Date().toISOString();
    const page = { requestCursor: null, nextCursor: null, reportedTotal: 1,
      observedAt, responseDigest: `sha256:${identity}`,
      works: [{ externalId: `work_${identity.slice(-4)}`, title: "快手作品", kind: "video",
        publishedAt: observedAt, playCount: 0, likeCount: 4, commentCount: null,
        source: "/rest/cp/works/v2/video/pc/photo/list", observedAt }] };
    return { first: [page], second: [page], identity: { platformIdentity: identity,
      displayName: "快手测试账号", kwaiId: null, followerCount: 0,
      source: "/rest/cp/creator/pc/home/infoV2" } };
  },
}));

import { compositeTransport, __resetPersistenceForTests } from "@/server/persistence-client";
const ctx: RequestContext = { userId: canonicalDataset.user.id, requestId: "platform-test", source: "user" };
beforeEach(() => { vi.stubEnv("CREATOROS_WEB_AUTH_DIR",join(stub.root,"web")); __resetPersistenceForTests(); stub.sequence = 0; stub.repeatXhsIdentity = false; });
afterAll(async () => { await rm(stub.root, { recursive: true, force: true });vi.unstubAllEnvs(); });

async function readWorks(accountId: string) {
  const result = await compositeTransport.request(ENDPOINTS.listWorks, {
    params: { accountId }, query: { pageSize: 20 }, body: undefined,
  }, { ...ctx, accountId }) as { data: { catalogCompleteness: string; total: number; items: Array<{ externalId: string }> } };
  return result.data;
}

describe("本机平台绑定与受信采集组合", () => {
  it("扫码核验后两个账号各写自己的完整目录和指标，错号读拒绝", async () => {
    const accounts: string[] = [];
    for (const clientRequestId of ["scan-one", "scan-two"]) {
      const bound = await compositeTransport.request(ENDPOINTS.beginBind, {
        params: undefined, query: undefined,
        body: { platform: "xiaohongshu", clientRequestId },
      }, ctx) as { data: { status: string; accountId: string } };
      expect(bound.data.status).toBe("bound");
      accounts.push(bound.data.accountId);
    }
    expect(accounts[0]).not.toBe(accounts[1]);
    for (const [index, accountId] of accounts.entries()) {
      let works = await readWorks(accountId!);
      for (const until=Date.now()+120_000; Date.now()<until && works.catalogCompleteness !== "verifiedComplete";) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        works = await readWorks(accountId!);
      }
      expect(works.catalogCompleteness).toBe("verifiedComplete");
      expect(works.total).toBe(1);
      expect(works.items[0]?.externalId).toBe(`note_000${index + 1}`);
    }
    let metrics = await compositeTransport.request(ENDPOINTS.readMetrics, {
      params: { accountId: accounts[0] }, query: { pageSize: 100 }, body: undefined,
    }, { ...ctx, accountId: accounts[0] }) as { data: { workMetrics: Array<{ metricKey: string; value: number | null }> } };
    const metricUntil=Date.now()+120_000;
    while(Date.now()<metricUntil&&!metrics.data.workMetrics.some(metric=>metric.metricKey==='view_count'&&metric.value===0)){await new Promise(resolve=>setTimeout(resolve,25));metrics=await compositeTransport.request(ENDPOINTS.readMetrics,{params:{accountId:accounts[0]},query:{pageSize:100},body:undefined},{...ctx,accountId:accounts[0]}) as typeof metrics;}
    expect(metrics.data.workMetrics.some((metric) => metric.metricKey === "view_count" && metric.value === 0)).toBe(true);
    await expect(compositeTransport.request(ENDPOINTS.listWorks, {
      params: { accountId: accounts[0] }, query: { pageSize: 20 }, body: undefined,
    }, { ...ctx, accountId: accounts[1] })).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
  });
  it("快手扫码后自动采集作品、真零播放与账号粉丝指标", async () => {
    const bound = await compositeTransport.request(ENDPOINTS.beginBind, {
      params: undefined, query: undefined,
      body: { platform: "kuaishou", clientRequestId: "scan-ks" },
    }, ctx) as { data: { status: string; accountId: string } };
    expect(bound.data.status).toBe("bound");
    const accountId = bound.data.accountId;
    let works = await readWorks(accountId);
    for (const until=Date.now()+120_000; Date.now()<until && works.catalogCompleteness !== "verifiedComplete";) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      works = await readWorks(accountId);
    }
    expect(works.catalogCompleteness).toBe("verifiedComplete");
    expect(works.items[0]?.externalId).toBe("work_0001");
    let metrics: { accountMetrics: Array<{ metricKey: string; value: number | null }>;
      workMetrics: Array<{ metricKey: string; value: number | null }> } = { accountMetrics: [], workMetrics: [] };
    for (const until=Date.now()+120_000; Date.now()<until;) {
      const result = await compositeTransport.request(ENDPOINTS.readMetrics, {
        params: { accountId }, query: { pageSize: 100 }, body: undefined,
      }, { ...ctx, accountId }) as { data: typeof metrics };
      metrics = result.data;
      if (metrics.accountMetrics.length && metrics.workMetrics.length) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(metrics.accountMetrics.some((metric) => metric.metricKey === "follower_count" && metric.value === 0)).toBe(true);
    expect(metrics.workMetrics.some((metric) => metric.metricKey === "play_count" && metric.value === 0)).toBe(true);
  });

  it("小红书同一平台身份重扫复用原账号，不产生第二个工作区", async () => {
    const first = await compositeTransport.request(ENDPOINTS.beginBind, {
      params: undefined, query: undefined,
      body: { platform: "xiaohongshu", clientRequestId: "first-bind" },
    }, ctx) as { data: { accountId: string } };
    for (const until=Date.now()+120_000; Date.now()<until;) {
      if ((await readWorks(first.data.accountId)).catalogCompleteness === "verifiedComplete") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    stub.repeatXhsIdentity = true;
    const second = await compositeTransport.request(ENDPOINTS.beginBind, {
      params: undefined, query: undefined,
      body: { platform: "xiaohongshu", clientRequestId: "repeat-bind" },
    }, ctx) as { data: { accountId: string } };
    expect(second.data.accountId).toBe(first.data.accountId);
  });
});
it.each(['xiaohongshu','kuaishou'] as const)('T1069 %s公开持久任务绑定入口、状态回读和真实组成员连通',async(platform)=>{
 const created=await compositeTransport.request(ENDPOINTS.createAccountGroup,{params:undefined,query:undefined,body:{name:'中性持久平台组',idempotencyKey:`group-${platform}`} },ctx) as {data:{id:string;version:number}};
 const frozen={...ctx,accountId:null,groupId:created.data.id};
 const capability=await compositeTransport.request(ENDPOINTS.getPlatformAccountCapabilities,{params:undefined,query:undefined,body:undefined},frozen) as {data:Array<{platform:string;bind:{available:boolean;method:string}}>};expect(capability.data.find(row=>row.platform===platform)?.bind).toMatchObject({available:true,method:'qr'});
 const run=await compositeTransport.request(ENDPOINTS.startAccountBinding,{params:undefined,query:undefined,body:{groupId:created.data.id,platform,expectedGroupVersion:created.data.version,idempotencyKey:`original-${platform}`}},frozen) as {data:{runId:string;status:string;accountId:string|null}};
 const same=await compositeTransport.request(ENDPOINTS.startAccountBinding,{params:undefined,query:undefined,body:{groupId:created.data.id,platform,expectedGroupVersion:created.data.version,idempotencyKey:`original-${platform}`}},frozen) as typeof run;expect(same.data.runId).toBe(run.data.runId);
 let result=run;const until=Date.now()+120_000;
 while(Date.now()<until&&!['succeeded','failed','cancelled'].includes(result.data.status)){await new Promise(resolve=>setTimeout(resolve,100));result=await compositeTransport.request(ENDPOINTS.getAccountBinding,{params:{runId:run.data.runId},query:undefined,body:undefined},frozen) as typeof run;}
 expect(result.data).toMatchObject({status:'succeeded',accountId:expect.any(String)});
 const account=await compositeTransport.request(ENDPOINTS.getAccount,{params:{accountId:result.data.accountId!},query:undefined,body:undefined},frozen) as {data:{platform:string}};expect(account.data.platform).toBe(platform);
 const group=await compositeTransport.request(ENDPOINTS.getAccountGroup,{params:{groupId:created.data.id},query:undefined,body:undefined},frozen) as {data:{members:Array<{accountId:string}>}};expect(group.data.members.map(member=>member.accountId)).toEqual([result.data.accountId]);
});
