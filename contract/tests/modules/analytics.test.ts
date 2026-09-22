import { describe, it, expect } from "vitest";
import {
  metricSnapshotResource,
  audienceSnapshotResource,
} from "../../src/resources/analytics";
import { ENDPOINTS as analyticsOperations } from "../../src/endpoints";
import type { Endpoint } from "../../src/endpoints";
import { getCliOperationPolicy } from '../../src/cli-policy';

describe('T1027 同账号单作品受控评论诊断',()=>{
 const operation=()=>{const op=Object.values(analyticsOperations).find(op=>op.id==='analytics.comments.diagnose');expect(op).toBeDefined();return op as Endpoint;};
 it('正式operation与CLI external幂等门，不冒充采集task',()=>{
  const op=operation();expect(op).toMatchObject({method:'POST',path:'/analytics/comments/diagnose'});
  expect(getCliOperationPolicy(op.id)).toEqual({effect:'external',confirmation:'confirm_impact',asyncTask:false,idempotency:'gateway'});
 });
 it('只接受固定阶段与一个publication，禁止selector/脚本/目录/URL与通用动作',()=>{
  const schema=operation().body!;
  expect(schema.parse({action:'start',publicationId:'publication-real'})).toEqual({action:'start',publicationId:'publication-real'});
  for(const invalid of [{action:'start',publicationIds:['a','b']},{action:'click',selector:'button'},...['selector','url','script','authDir','accountId','headers'].map(key=>({action:'start',publicationId:'p',[key]:'PRIVATE'})),{action:'advance',diagnosisId:'d',expectedRevision:0,observationId:'o',intent:'submit',targetRef:'r'}])expect(schema.safeParse(invalid).success).toBe(false);
 });
 it('advance必须携带当前revision与observation，close不依赖publication存续',()=>{
  const schema=operation().body!;
  expect(schema.safeParse({action:'advance',diagnosisId:'d',expectedRevision:1,observationId:'o',intent:'expand_navigation',targetRef:'r'}).success).toBe(true);
  expect(schema.safeParse({action:'advance',diagnosisId:'d',intent:'enter_comments',targetRef:'r'}).success).toBe(false);
  expect(schema.parse({action:'close',diagnosisId:'d'})).toEqual({action:'close',diagnosisId:'d'});
 });
});

describe("analytics contract", () => {
  it("parses a MetricSnapshot resource", () => {
    const ms = metricSnapshotResource.parse({
      id: "ms-podcast-bilibili-1",
      publicationId: "pub-podcast-bilibili",
      ingestionRunId: "run-1",
      capturedAt: "2026-06-12T02:00:00.000Z",
      source: "platform_api",
      rawMetrics: {},
      createdAt: "2026-06-12T02:00:00.000Z",
    });
    expect(ms.source).toBe("platform_api");
    expect(ms.ingestionRunId).toBe("run-1");
  });

  it("parses an AudienceSnapshot resource", () => {
    const aud = audienceSnapshotResource.parse({
      id: "aud-age-1",
      publicationId: "pub-podcast-bilibili",
      capturedAt: "2026-06-12T02:00:00.000Z",
      dimensionType: "age",
      dimensionValue: "18-24",
      percentage: 0.22,
      audienceCount: 4052,
    });
    expect(aud.dimensionType).toBe("age");
  });

  // Monetization-weighted dimensionType additions (§4.6). Don't weaken: assert
  // both new values parse while legacy values keep working above.
  it.each(["intent", "paying"] as const)(
    "accepts monetization audience dimensionType %s",
    (dimensionType) => {
      const aud = audienceSnapshotResource.parse({
        id: "aud-monetization",
        publicationId: "pub-podcast-bilibili",
        capturedAt: "2026-06-12T02:00:00.000Z",
        dimensionType,
        dimensionValue: "high",
        percentage: 0.12,
        audienceCount: 320,
      });
      expect(aud.dimensionType).toBe(dimensionType);
    },
  );

  it("still rejects an unknown dimensionType", () => {
    expect(() =>
      audienceSnapshotResource.parse({
        id: "aud-x",
        publicationId: "pub-podcast-bilibili",
        capturedAt: "2026-06-12T02:00:00.000Z",
        dimensionType: "not_a_dimension",
        dimensionValue: "x",
        percentage: 0.1,
        audienceCount: 1,
      }),
    ).toThrow();
  });

  it("registers the publication + project analytics endpoints", () => {
    expect(analyticsOperations.getPublicationAnalytics.method).toBe("GET");
    expect(analyticsOperations.getPublicationAnalytics.path).toBe(
      "/analytics/publications/:publicationId",
    );
    expect(analyticsOperations.getProjectAnalytics.method).toBe("GET");
    expect(analyticsOperations.getProjectAnalytics.path).toBe(
      "/analytics/projects/:projectId",
    );
    expect(
      analyticsOperations.getPublicationAnalytics.fr.length,
    ).toBeGreaterThan(0);
  });
});

describe('T-1027 当前账号评论失败重试契约',()=>{
 const endpoint=(id:string)=>{
  const found=Object.values(analyticsOperations).find(operation=>operation.id===id);
  expect(found,`缺少正式 operation ${id}`).toBeDefined();
  return found as Endpoint;
 };
 const failureVersion=`sha256:${'a'.repeat(64)}`;
 const failure={publicationId:'pub-real',externalId:'aweme-real',attemptedAt:'2026-09-22T04:00:00.000Z',retryAt:'2026-09-22T06:00:00.000Z',lastSucceededAt:'2026-09-22T03:00:00.000Z',failures:2,failureVersion};

 it('分页失败清单返回真实作品与失败基线，不接受请求体账号覆盖',()=>{
  const op=endpoint('analytics.comments.failures.list');
  expect(op).toMatchObject({method:'GET',path:'/analytics/comments/failures',isList:true});
  expect(op.query!.parse({})).toEqual({page:1,pageSize:20});
  expect(op.query!.safeParse({pageSize:101}).success).toBe(false);
  expect(op.response.parse(failure)).toEqual(failure);
  expect(op.response.safeParse({...failure,failures:0}).success).toBe(false);
  expect(op.response.safeParse({...failure,failureVersion:'invented'}).success).toBe(false);
  expect(op.body).toBeUndefined();
 });

 it('重试只接受1–100个不重复的真实ID及失败基线，不接受清历史/成功水位/平台冷却参数',()=>{
  const op=endpoint('analytics.comments.retry');
  expect(op).toMatchObject({method:'POST',path:'/analytics/comments/retry',isList:false});
  const body={items:[{publicationId:'pub-real',failureVersion}]};
  expect(op.body!.parse(body)).toEqual(body);
  for(const invalid of [
   {items:[]},
   {items:Array.from({length:101},(_,i)=>({publicationId:`pub-${i}`,failureVersion}))},
   {items:[body.items[0],body.items[0]]},
   {items:[{publicationId:'pub-real'}]},
   {items:[{publicationId:'pub-real',failureVersion:'wrong'}]},
   {...body,accountId:'other-account'},
   {...body,resetGateway:true},
   {...body,retryAt:'2000-01-01T00:00:00.000Z'},
   {items:[{...body.items[0],failures:0,lastSucceededAt:null}]},
  ])expect(op.body!.safeParse(invalid).success).toBe(false);
 });

 it('重试回执仅声明作品重试时间已调整，不冒充已抓取或成功',()=>{
  const op=endpoint('analytics.comments.retry');
  const response={items:[{publicationId:'pub-real',failureVersion,retryAt:'2026-09-22T04:30:00.000Z'}],updated:1};
  expect(op.response.parse(response)).toEqual(response);
  expect(op.response.safeParse({...response,status:'succeeded',itemsNew:1}).success).toBe(false);
 });
});
