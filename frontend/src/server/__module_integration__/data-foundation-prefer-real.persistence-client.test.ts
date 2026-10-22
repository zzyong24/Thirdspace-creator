import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import type { ProjectsService } from "@creatoros/backend/modules/projects";

const fixture=vi.hoisted(()=>({projects:null as ProjectsService|null}));
vi.mock("@creatoros/backend/modules/projects",async original=>{
  const actual=await original<typeof import("@creatoros/backend/modules/projects")>();
  return {...actual,createProjectsService:(...args:Parameters<typeof actual.createProjectsService>)=>{
    const service=actual.createProjectsService(...args);
    // 透明保留组合根服务；采集夹具经原具名内部入口，不能伪装公开import权限。
    if(args[2])fixture.projects=service;
    return service;
  }};
});

// 数据底座(SPEC §1.4)优先读真接线 —— composition root 的三向读侧端到端断言,经
// compositeTransport 打 pages.dashboard.get(同 server 页面 + /api/v1 route 共享的真 pglite)。
//   ① 兜底:仅 fixture 演示作品(seed,source='manual')时 → 最近发布出 fixture 真标题(过渡期不破);
//   ② 优先读真:种入 1 个 source='imported' 真项目 + 其已发布作品后 → 判据翻真,最近发布让 fixture
//      让位、只出真实导入作品(治 dy-pub-00 假标题);imported 作品标题经 content_output 回退恢复。
//
// 种 imported 走原采集内部入口ensureImportedProject→公开读取，再走
// outputs.publications.create(transition published),与 T-001 落库形状一致(source/外发布)。

// T1246 显式受控平台适配器，只验证原发布事务/幂等/索引；不启动浏览器或发布真人内容。
vi.mock("@creatoros/backend/modules/publishing", async importOriginal => {
  const actual = await importOriginal<typeof import("@creatoros/backend/modules/publishing")>();
  return {...actual,createUnavailablePublisher:()=>actual.createMockPublisher()};
});

const ep = (id: string) => ({ id }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:projects/publications/calibration 全部 per-account,ctx 必须
// 带 accountId(未选号 → AccountRequiredError,SPEC §4.2)。同一派生号贯穿种入与三向读,
// 保证「种的数据」与「dashboard/复盘读到的数据」在同号域内闭环。
let owner: RequestContext = {
  userId: canonicalDataset.user.id,
  requestId: "req-test",
  source: "user",
  accountId: `acct-of-${canonicalDataset.user.id}`,
};

// 一条 seed 的 fixture 抖音作品标题(dy-pub-00 的 revision 标题)—— 兜底分支必须出现它,
// 优先读真分支必须消失它。
const FIXTURE_TITLE = "AI 产出差不是工具的锅";

interface DashboardDto {
  recentPublications: Array<{ id: string; title: string; views: number }>;
  trendingTopics: Array<{ id: string; title: string; heat: number }>;
}

async function getDashboard(): Promise<DashboardDto> {
  const res = (await compositeTransport.request(
    ep("pages.dashboard.get"),
    { params: undefined, query: undefined, body: undefined } as never,
    owner,
  )) as { data: DashboardDto };
  return res.data;
}

interface CalibrationOverviewDto {
  pendingSubjects: Array<{
    subjectType: string;
    subjectId: string;
    title: string;
    platform: string;
  }>;
}

async function getCalibrationOverview(): Promise<CalibrationOverviewDto> {
  const res = (await compositeTransport.request(
    ep("calibration.overview"),
    { params: undefined, query: undefined, body: undefined } as never,
    owner,
  )) as { data: CalibrationOverviewDto };
  return res.data;
}

beforeEach(async () => {
  fixture.projects=null;
  __resetPersistenceForTests();
  const account = await compositeTransport.request(ep("accounts.create"), {
    params:undefined,query:undefined,body:{platform:"douyin",accountHandle:"@t1246-real-data",followerBaseline:0},
  } as never, {userId:canonicalDataset.user.id,requestId:"owned-account",source:"user"}) as {data:{id:string}};
  owner = {...owner,accountId:account.data.id};
});

describe("数据底座 §1.4 — pages.dashboard.get 优先读真 / fixture 兜底", () => {
  it("首页热门选题只读当前 pool，已丢弃选题不再进入榜单", async () => {
    const kept = (await compositeTransport.request(
      ep("candidates.create"),
      {
        params: undefined,
        query: undefined,
        body: { title: "保留选题", angle: "", source: "idea" },
      } as never,
      owner,
    )) as { data: { id: string } };
    const dropped = (await compositeTransport.request(
      ep("candidates.create"),
      {
        params: undefined,
        query: undefined,
        body: { title: "丢弃选题", angle: "", source: "idea" },
      } as never,
      owner,
    )) as { data: { id: string } };
    await compositeTransport.request(
      ep("candidates.patch"),
      {
        params: { candidateId: dropped.data.id },
        query: undefined,
        body: { status: "dropped" },
      } as never,
      owner,
    );

    const dash = await getDashboard();
    expect(dash.trendingTopics.map((t) => t.id)).toContain(kept.data.id);
    expect(dash.trendingTopics.map((t) => t.id)).not.toContain(dropped.data.id);
  });

  it("诚实空:无真数据时,最近发布 + 复盘待校准为空(fixture 演示种子已退役,T-050)", async () => {
    // [T-050 用户裁决] douyin/canonical 演示发布不再 seed:没有真数据就是空态,
    // 绝不再用 fixture 演示作品凑数(「过渡期不破」的过渡期结束)。
    const dash = await getDashboard();
    const titles = dash.recentPublications.map((p) => p.title);
    expect(titles).not.toContain(FIXTURE_TITLE);
    expect(dash.recentPublications).toHaveLength(0);

    const overview = await getCalibrationOverview();
    expect(
      overview.pendingSubjects.some((s) => s.title === FIXTURE_TITLE),
    ).toBe(false);
    expect(overview.pendingSubjects).toHaveLength(0);
  });

  it("优先读真:种入 imported 真项目后,最近发布让 fixture 让位、只出真实导入作品", async () => {
    // —— 种一个真实采集导入项目(source:imported)+ 作品 + 已发布 publication ——
    await expect(compositeTransport.request(ep("projects.create"),{body:{title:"公开不能伪装采集",source:"imported",platformRef:{platform:"douyin",externalId:"aweme-forged"}}} as never,owner)).rejects.toThrow("公开创建不能声明采集导入来源");
    const imported=await fixture.projects!.ensureImportedProject(owner,{title:"真实导入作品·四步法",platform:"douyin",externalId:"aweme-real-1"});
    const proj=(await compositeTransport.request(ep("projects.get"),{params:{projectId:imported.projectId}} as never,owner)) as {data:{id:string;source:string}};
    expect(proj.data.source).toBe("imported");

    const output={data:{id:imported.outputId}};

    const pub = (await compositeTransport.request(
      ep("outputs.publications.create"),
      {
        params: { outputId: output.data.id },
        query: undefined,
        body: { platform: "douyin", accountReference: "@me" },
      } as never,
      owner,
    )) as { data: { id: string } };

    // 真实作品发布出去(published),才进入"最近发布"。
    await compositeTransport.request(
      ep("publications.transition"),
      {
        params: { publicationId: pub.data.id },
        query: undefined,
        body: { status: "published" },
      } as never,
      owner,
    );

    // —— 断言:判据翻真 → 最近发布只剩真实导入作品,fixture 让位 ——
    const dash = await getDashboard();
    const titles = dash.recentPublications.map((p) => p.title);
    // 真实导入作品标题经 content_output 回退恢复(imported publication 无 revision)。
    expect(titles).toContain("真实导入作品·四步法");
    // 任何 fixture 演示作品标题都不再出现(全部让位)。
    expect(titles).not.toContain(FIXTURE_TITLE);
    // 收窄到 imported 集:返回的发布全部来自真实导入项目(此处只种了 1 条)。
    expect(dash.recentPublications).toHaveLength(1);

    // 复盘待校准内容同样让位:只列真实导入项目的作品/发布,fixture 演示主体消失。
    const overview = await getCalibrationOverview();
    const subjectTitles = overview.pendingSubjects.map((s) => s.title);
    expect(subjectTitles).toContain("真实导入作品·四步法"); // imported 作品(content_output)
    expect(subjectTitles).not.toContain(FIXTURE_TITLE); // fixture 让位
    // 所有 pendingSubject 都属于真实导入项目(此处只 1 个 imported 项目 + 1 作品 + 1 发布)。
    expect(overview.pendingSubjects.length).toBeGreaterThan(0);
    expect(
      overview.pendingSubjects.every(
        (s) =>
          s.title === "真实导入作品·四步法" || s.platform === "douyin",
      ),
    ).toBe(true);
  });
});
