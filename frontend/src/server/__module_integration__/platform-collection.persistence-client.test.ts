import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import type {WechatNativeCollectorPorts} from '@creatoros/backend/application/collection/wechat-native-collector';
const nativeWiring=vi.hoisted(()=>({ports:null as WechatNativeCollectorPorts|null}));
vi.mock('@creatoros/backend/application/collection/wechat-native-collector',async importOriginal=>{
 const actual=await importOriginal<typeof import('@creatoros/backend/application/collection/wechat-native-collector')>();
 return {...actual,createWechatNativeCollector:(ports:WechatNativeCollectorPorts)=>{nativeWiring.ports=ports;return actual.createWechatNativeCollector(ports);}};
});
vi.mock('@creatoros/ai-worker/platform/wechat-browser-source',async importOriginal=>{
 const actual=await importOriginal<typeof import('@creatoros/ai-worker/platform/wechat-browser-source')>();
 return {...actual,createWechatBrowserSource:(...args:Parameters<typeof actual.createWechatBrowserSource>)=>({...actual.createWechatBrowserSource(...args),collectNativeReports:async(...params:Parameters<ReturnType<typeof actual.createWechatBrowserSource>['collectNativeReports']>)=>{
  params[3]?.onDiagnostic?.({platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code:'REPORT_LINK_MISSING',exceptionName:'WechatBrowserSourceError',entryObservation:{entryPhase:'wait_entry_or_centre',entryVisibleCount:0,centreVisibleCount:0,centreClicked:false},attemptId:'synthetic-source-asserted-attempt'} as never);return [];
 }})};
});
import { compositeTransport, __resetPersistenceForTests } from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";

const ctx: RequestContext = {
  userId: canonicalDataset.user.id, requestId: "platform-collection-test", source: "user",
};

beforeEach(() => __resetPersistenceForTests());

describe("platform collection composite wiring", () => {
  it('T1363正式组合根仅以可信options.attemptId关联安全菜单诊断',async()=>{
    await compositeTransport.request(ENDPOINTS.listCapabilities,{params:undefined,query:undefined,body:undefined},ctx);
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try{
      expect(nativeWiring.ports).not.toBeNull();
      await nativeWiring.ports!.collectReports({directory:'/synthetic-only-profile',platform:'wechatVideo',expectedPlatformIdentity:'synthetic-only-identity',attemptId:'trusted-synthetic-attempt',signal:new AbortController().signal,deadlineAt:Date.now()+30*60000,onReport:async()=>{},onStopped:async()=>{},onStopUnconfirmed:()=>{}});
      expect(warn).toHaveBeenCalledWith('[wechat-native-report]',{platform:'wechatVideo',stage:'prepare',kind:'channelsDaily',code:'REPORT_LINK_MISSING',exceptionName:'WechatBrowserSourceError',entryObservation:{entryPhase:'wait_entry_or_centre',entryVisibleCount:0,centreVisibleCount:0,centreClicked:false},attemptId:'trusted-synthetic-attempt'});
      expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-source-asserted-attempt');expect(JSON.stringify(warn.mock.calls)).not.toContain('/synthetic-only-profile');expect(JSON.stringify(warn.mock.calls)).not.toContain('synthetic-only-identity');
    }finally{warn.mockRestore();}
  },120000);
  it("exposes local platform adapters and an empty owned catalog", async () => {
    const capabilities = await compositeTransport.request(ENDPOINTS.listCapabilities, {
      params: undefined, query: undefined, body: undefined,
    }, ctx) as {
      data: { items: Array<{ platform: string; capability: string; supported: boolean; reasonCode: string }> };
    };
    expect(capabilities.data.items.find(item => item.platform === "kuaishou" && item.capability === "workCatalog"))
      .toMatchObject({ supported: true, reasonCode: null });
    expect(capabilities.data.items.find(item => item.platform === "xiaohongshu" && item.capability === "workCatalog"))
      .toMatchObject({ supported: true, reasonCode: null });

    const created = await compositeTransport.request(ENDPOINTS.createAccount, {
      params: undefined, query: undefined,
      body: { platform: "douyin", accountHandle: "测试账号" },
    }, ctx) as { data: { id: string } };
    const accountId = created.data.id;
    const scoped = { ...ctx, accountId };
    const works = await compositeTransport.request(ENDPOINTS.listWorks, {
      params: { accountId }, query: { pageSize: 20 }, body: undefined,
    }, scoped) as { data: { catalogCompleteness: string; total: number; items: unknown[] } };
    expect(works.data).toMatchObject({ catalogCompleteness: "none", total: 0, items: [] });
    const metrics = await compositeTransport.request(ENDPOINTS.readMetrics, {
      params: { accountId }, query: { pageSize: 20 }, body: undefined,
    }, scoped) as { data: { accountMetrics: unknown[]; workMetrics: unknown[] } };
    expect(metrics.data).toMatchObject({ accountMetrics: [], workMetrics: [] });
    await expect(compositeTransport.request(ENDPOINTS.startCollection, {
      params: { accountId }, query: undefined,
      body: { capability: "workCatalog", clientRequestId: "scan-1" },
    }, scoped)).rejects.toMatchObject({ code: "SOURCE_UNMAPPED" });
    await expect(compositeTransport.request(ENDPOINTS.listWorks, {
      params: { accountId }, query: { pageSize: 20 }, body: undefined,
    }, { ...ctx, userId: "other-user", accountId })).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
  });
});
