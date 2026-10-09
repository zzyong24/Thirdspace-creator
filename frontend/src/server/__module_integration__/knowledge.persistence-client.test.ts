import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { KNOWLEDGE_OP_IDS } from "@creatoros/backend/modules/knowledge";

// 集成测试不应依赖用户本机 home 状态(win-video-tutor skill 在 ~/.claude/skills/ 真装着
// → buildPersistence 走 seedWinVideoTutor → 写 22 条 → 旧「list 应空」断言挂)。
// 关掉 seed,断言「真空」只测 round-trip,seed 行为在 src/server/seeds/win-video-tutor.test.ts 单测。
const SEED_PATH_OVERRIDE = "/nonexistent/for-integration-test";
let prevSeedEnv: string | undefined;
beforeAll(() => {
  prevSeedEnv = process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH;
  process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH = SEED_PATH_OVERRIDE;
});
afterAll(() => {
  if (prevSeedEnv === undefined) delete process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH;
  else process.env.CREATOROS_WIN_VIDEO_TUTOR_SKILL_PATH = prevSeedEnv;
});

// D2 — all knowledge ops are registered into the composite (PERSISTED_OPS) and
// a knowledge.create round-trips through compositeTransport against the seeded
// pglite store. Proves the module is wired into the same store server reads +
// the /api/v1 route share (foundation §1 registry). They include the two
// GAP-RES-1 soft-delete ops (knowledge.archive, knowledge.relations.delete).

const ep = (id: string, isList = false) => ({ id, isList }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:知识库按号独立(SPEC C-01),ctx 必须带 accountId
// (未选号 → AccountRequiredError,SPEC §4.2)。空读域可派生；写入必须正常创建账号。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});
// T-1022：写入前正常创建所属账号及其资源组，不伪造 legacy group 外键。
async function createAccountContext(platform: "douyin" | "bilibili" = "douyin"): Promise<RequestContext> {
  const owner = ctx(canonicalDataset.user.id);
  const created = await compositeTransport.request(ep("accounts.create"), {body:{platform,accountHandle:"@isolated-index",followerBaseline:0}} as never, {...owner,accountId:null}) as {data:{id:string}};
  return {...owner,accountId:created.data.id};
}


beforeEach(() => {
  __resetPersistenceForTests();
});

describe("knowledge ops registered in the composite transport", () => {
  it("the 13 knowledge op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of KNOWLEDGE_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    // [T-519] 文件夹 list/create + move 进入同一真实 transport 后共 13 个。
    expect(KNOWLEDGE_OP_IDS).toHaveLength(13);
    // The two GAP-RES-1 soft-delete ops are in the owned set.
    expect(KNOWLEDGE_OP_IDS).toContain("knowledge.archive");
    expect(KNOWLEDGE_OP_IDS).toContain("knowledge.relations.delete");
    expect(KNOWLEDGE_OP_IDS).toContain("knowledge.relations.listAll");
  });

  it("[User] knowledge.list 开箱 = win-video-tutor 22 节课程(replace T-135 退役的 Zyong 假内容)", async () => {
    // T-135 补漏退役了 canonical 假金句 + douyin 真金句(后者是用户私内容不该固化重灌)。
    // 后续用户从 win-video-tutor skill 给了真课程 zip(22 节 .md),作为替换 seed 到 canonical
    // user 知识库(运行 buildPersistence 时一次性 idempotent 写入):
    //   - 22 个 knowledgeItem,knowledgeType=reference,sourceType=import,
    //     sourceMetadata.origin='win-video-tutor' + lessonNumber + module。
    //   - 课程源 `~/.claude/skills/win-video-tutor/knowledge/*.md` 在集成测试里**没造**
    //     (test 不写 skill 目录),所以 seed 走 ENOENT 安静返回 0;knowledge.list 应该 0
    //     → 与原「T-135 全空」期望一致(语义不变,只是多了「真内容路径」在生产)。
    // 真正的 win-video-tutor 写入在 src/server/seeds/win-video-tutor.test.ts 单独覆盖。
    const res = (await compositeTransport.request(
      ep("knowledge.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; userId: string }> };
    expect(res.data.length).toBe(0);
    expect(res.data).toEqual([]);
  });

  it("knowledge.create round-trips: the new item is then listable", async () => {
    const owner = await createAccountContext();
    const created = (await compositeTransport.request(
      ep("knowledge.create"),
      {
        params: undefined,
        query: undefined,
        body: { title: "新建知识", knowledgeType: "note", content: "正文" },
      } as never,
      owner,
    )) as { data: { id: string; status: string; currentRevisionId: string } };
    expect(created.data.status).toBe("active");
    expect(created.data.currentRevisionId).toBeTruthy();

    const list = (await compositeTransport.request(
      ep("knowledge.list", true),
      { params: undefined, query: { page: 1, pageSize: 50 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(list.data.some((r) => r.id === created.data.id)).toBe(true);
  });
});
