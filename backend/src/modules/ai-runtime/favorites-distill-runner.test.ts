import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";

// [T-235d-distill] 收藏夹蒸馏链 runner 单测 —— 全端口 fake(不碰真抖音/真 ASR/真模型),验证:
//   ① transcript 落点(已有则复用省流 / 无则 transcribeOne + saveTranscript);
//   ② 判库路由(knowledge → 蒸馏产 atoms 存确认门候选 / topic / skip);
//   ③ 图集无口播 → 诚实 skip(非失败,不重试);
//   ④ best-effort:单条(转写 / 判库 / 蒸馏)失败 → 标 failed,其余继续,不崩整批;
//   ⑤ **origin 隔离结构性保证**:runner 的 deps 面里没有任何 artifact/project 绑定端口;
//   ⑥ ≤maxItemsPerRun 限量;
//   ⑦ 判库端口工厂 createFavoritesTriagePort 走 favorites.triage capability(可配不写死)+ 截断。
// 另 mock ai-worker 的 runStructuredNode(端口工厂动态 import 目标),验 capability/facet 装配。

const runStructuredNode = vi.fn();
vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runStructuredNode: (...args: unknown[]) => runStructuredNode(...args),
  getTemplate: (id: string) => ({ id }),
}));

import {
  runFavoritesDistill,
  createFavoritesTriagePort,
  truncateForTriage,
  MAX_TRIAGE_TRANSCRIPT_CHARS,
  type FavoritesDistillDeps,
} from "./favorites-distill-runner";
import type { DistillCandidateItem, DistillVerdict } from "../favorites";
import type { KnowledgeDistillation } from "./knowledge-distill-runner";

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

function candItem(
  awemeId: string,
  over: Partial<DistillCandidateItem> = {},
): DistillCandidateItem {
  return {
    id: over.id ?? `favitm-${awemeId}`,
    folderId: "favfld-1",
    awemeId,
    title: over.title ?? `视频 ${awemeId}`,
    authorNickname: "作者甲",
    url: `https://www.douyin.com/video/${awemeId}`,
    transcript: over.transcript ?? null,
  };
}

/** 一套可覆写的 fake deps + 落库台账(assert 用)。 */
function makeDeps(
  items: DistillCandidateItem[],
  over: Partial<FavoritesDistillDeps> = {},
) {
  const savedTranscripts = new Map<string, string>();
  const savedVerdicts = new Map<string, DistillVerdict>();
  const deps: FavoritesDistillDeps = {
    listItemsForDistill: async (_c, limit) => items.slice(0, limit),
    transcribeOne: async (_c, awemeId) => `逐字稿-${awemeId}`,
    saveTranscript: async (_c, itemId, t) => {
      savedTranscripts.set(itemId, t);
    },
    triage: async () => ({ verdict: "topic", reason: "默认纯选题" }),
    distillKnowledge: async (): Promise<KnowledgeDistillation> => ({
      atoms: [{ type: "claim", title: "原子", note: "", sourceNote: "" }],
      suggestedTags: ["tag"],
    }),
    saveVerdict: async (_c, itemId, v) => {
      savedVerdicts.set(itemId, v);
    },
    ...over,
  };
  return { deps, savedTranscripts, savedVerdicts };
}

beforeEach(() => {
  runStructuredNode.mockReset();
});

describe("truncateForTriage(判库送模型截断 6000)", () => {
  it("短逐字稿原样透传(trim)", () => {
    expect(truncateForTriage("  abc  ")).toBe("abc");
  });
  it("超限截断并标注(存库全文不受影响)", () => {
    const long = "字".repeat(MAX_TRIAGE_TRANSCRIPT_CHARS + 100);
    const out = truncateForTriage(long);
    expect(out.length).toBeLessThan(long.length);
    expect(out).toContain("已截断");
    expect(MAX_TRIAGE_TRANSCRIPT_CHARS).toBe(6000);
  });
});

describe("runFavoritesDistill —— transcript 落点", () => {
  it("无 transcript → transcribeOne + saveTranscript(他人作品独立落点)", async () => {
    const { deps, savedTranscripts } = makeDeps([candItem("aw-1")]);
    await runFavoritesDistill(ctx, deps);
    expect(savedTranscripts.get("favitm-aw-1")).toBe("逐字稿-aw-1");
  });

  it("已有 transcript → 复用不重转(省流,transcribeOne 不被调)", async () => {
    const transcribeOne = vi.fn(async () => "不该被调");
    const { deps, savedTranscripts } = makeDeps(
      [candItem("aw-1", { transcript: "已存逐字稿" })],
      { transcribeOne },
    );
    await runFavoritesDistill(ctx, deps);
    expect(transcribeOne).not.toHaveBeenCalled();
    expect(savedTranscripts.has("favitm-aw-1")).toBe(false); // 没重存
  });

  it("图集/无口播(transcribeOne 返 null)→ 诚实 skip(非失败)", async () => {
    const { deps, savedVerdicts } = makeDeps([candItem("aw-1")], {
      transcribeOne: async () => null,
    });
    const res = await runFavoritesDistill(ctx, deps);
    expect(res.skip).toBe(1);
    expect(res.failed).toBe(0);
    expect(savedVerdicts.get("favitm-aw-1")!.status).toBe("skip");
  });
});

describe("runFavoritesDistill —— 判库路由", () => {
  it("knowledge → distillKnowledge 产 atoms 存确认门候选(status=knowledge,不物化)", async () => {
    const distillKnowledge = vi.fn(
      async (): Promise<KnowledgeDistillation> => ({
        atoms: [
          { type: "claim", title: "可复用观点", note: "", sourceNote: "" },
        ],
        suggestedTags: ["洞察"],
      }),
    );
    const { deps, savedVerdicts } = makeDeps([candItem("aw-1")], {
      triage: async () => ({ verdict: "knowledge", reason: "含方法论" }),
      distillKnowledge,
    });
    const res = await runFavoritesDistill(ctx, deps);
    expect(res.knowledge).toBe(1);
    expect(distillKnowledge).toHaveBeenCalledOnce();
    const v = savedVerdicts.get("favitm-aw-1")!;
    expect(v.status).toBe("knowledge");
    expect((v.result.atoms as unknown[]).length).toBe(1);
    expect(v.result.suggestedTags).toEqual(["洞察"]);
    expect(v.result.reason).toBe("含方法论");
  });

  it("topic → 落 status=topic,不调 distillKnowledge(不重复灌库)", async () => {
    const distillKnowledge = vi.fn();
    const { deps, savedVerdicts } = makeDeps([candItem("aw-1")], {
      triage: async () => ({ verdict: "topic", reason: "只有跟拍价值" }),
      distillKnowledge,
    });
    const res = await runFavoritesDistill(ctx, deps);
    expect(res.topic).toBe(1);
    expect(distillKnowledge).not.toHaveBeenCalled();
    expect(savedVerdicts.get("favitm-aw-1")!.status).toBe("topic");
  });

  it("skip → 落 status=skip", async () => {
    const { deps, savedVerdicts } = makeDeps([candItem("aw-1")], {
      triage: async () => ({ verdict: "skip", reason: "口水无信息" }),
    });
    const res = await runFavoritesDistill(ctx, deps);
    expect(res.skip).toBe(1);
    expect(savedVerdicts.get("favitm-aw-1")!.status).toBe("skip");
  });

  it("判为知识但蒸不出(distillKnowledge 抛)→ failed(带 error,不崩)", async () => {
    const { deps, savedVerdicts } = makeDeps([candItem("aw-1")], {
      triage: async () => ({ verdict: "knowledge", reason: "看似有料" }),
      distillKnowledge: async () => {
        throw new Error("模型未蒸出可用原子");
      },
    });
    const res = await runFavoritesDistill(ctx, deps);
    expect(res.failed).toBe(1);
    const v = savedVerdicts.get("favitm-aw-1")!;
    expect(v.status).toBe("failed");
    expect(String(v.result.error)).toContain("知识蒸馏失败");
  });
});

describe("runFavoritesDistill —— best-effort / 限量 / 空跑", () => {
  it("单条转写失败标 failed,其余继续(不崩整批)", async () => {
    const transcribeOne = vi.fn(async (_c: RequestContext, awemeId: string) => {
      if (awemeId === "aw-1") throw new Error("直链解析失败");
      return `逐字稿-${awemeId}`;
    });
    const { deps, savedVerdicts } = makeDeps(
      [candItem("aw-1"), candItem("aw-2")],
      { transcribeOne },
    );
    const res = await runFavoritesDistill(ctx, deps);
    expect(res.failed).toBe(1);
    expect(res.processed).toBe(2);
    expect(savedVerdicts.get("favitm-aw-1")!.status).toBe("failed");
    expect(savedVerdicts.get("favitm-aw-2")!.status).toBe("topic"); // 其余照常
  });

  it("≤maxItemsPerRun 限量(默认 3;可覆写)", async () => {
    const items = [candItem("a"), candItem("b"), candItem("c"), candItem("d")];
    const listSpy = vi.fn(async (_c: RequestContext, limit: number) =>
      items.slice(0, limit),
    );
    const { deps } = makeDeps(items, { listItemsForDistill: listSpy });
    await runFavoritesDistill(ctx, { ...deps, maxItemsPerRun: 2 });
    expect(listSpy).toHaveBeenCalledWith(ctx, 2);
  });

  it("无待蒸收藏 → 全 0(诚实空跑,非失败)", async () => {
    const { deps } = makeDeps([]);
    const res = await runFavoritesDistill(ctx, deps);
    expect(res).toEqual({
      processed: 0,
      knowledge: 0,
      topic: 0,
      skip: 0,
      failed: 0,
    });
  });

  it("origin 隔离结构性:deps 面无任何 artifact/project 绑定端口(收藏作品永不建 imported)", () => {
    const { deps } = makeDeps([]);
    const keys = Object.keys(deps);
    expect(keys).not.toContain("ensureTranscriptArtifact");
    expect(keys).not.toContain("findImportedProjectByAwemeId");
    // 逐字稿落点只经 saveTranscript(写 favorites_items),无 project/artifact 出口。
    expect(keys).toContain("saveTranscript");
  });
});

describe("createFavoritesTriagePort —— capability + facet 装配", () => {
  it('按 capability "favorites.triage" 解析 model + 注入 title/截断后 transcript', async () => {
    runStructuredNode.mockResolvedValue({
      object: { verdict: "knowledge", reason: "含方法论" },
    });
    const resolveModelSpec = vi.fn(async () => ({
      apiFormat: "anthropic" as const,
      baseUrl: null,
      model: "claude-opus-4-8",
      token: "k",
    }));
    const port = createFavoritesTriagePort({ resolveModelSpec });
    const long = "字".repeat(MAX_TRIAGE_TRANSCRIPT_CHARS + 100);
    const out = await port(ctx, { title: "标题", transcript: long });
    expect(out.verdict).toBe("knowledge");
    expect(resolveModelSpec).toHaveBeenCalledWith(ctx, "favorites.triage");
    const call = runStructuredNode.mock.calls[0]![0] as {
      template: { id: string };
      facets: { title: string; transcript: string };
    };
    expect(call.template.id).toBe("favorites.triage");
    expect(call.facets.title).toBe("标题");
    expect(call.facets.transcript).toContain("已截断"); // facet 截断生效
  });

  it("空标题兜底 (无标题);resolve 失败向上抛", async () => {
    const resolveModelSpec = vi.fn(async () => {
      throw new Error("no key");
    });
    const port = createFavoritesTriagePort({ resolveModelSpec });
    await expect(
      port(ctx, { title: "", transcript: "x" }),
    ).rejects.toThrow("no key");
  });
});
