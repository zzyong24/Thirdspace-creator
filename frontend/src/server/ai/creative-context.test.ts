import { describe, it, expect } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  assembleCreativeContext,
  markReconstructedBrief,
  type ContextDeps,
} from "./creative-context";

// F2 消费侧隔离单测(T-030-D4,SPEC §7 边界②)。creative-context 把项目的论点树/内容合同/
// 结构方案 artifact 当「用户已确认前提」注入下游(planning.outline / planning.contract /
// script.draft)。当这些 artifact 是 AI 历史反推(origin='reconstructed')时,brief **必须**被
// 显式标「未经确认」,下游不得静默当已确认。反之(origin='user' / null)brief 不带标注。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const RECONSTRUCTED_MARK = "未经你确认";

// 一个只装了 positioning(兜底空)+ thesis reader + artifactOrigin reader 的最小 deps。
function makeDeps(
  thesisOrigin: "user" | "reconstructed" | null,
): ContextDeps {
  return {
    positioning: {
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    thesis: {
      // 非空论点树(有内容才会被标注;空 brief 不标)。
      getThesisNodes: async () => [
        { column: "core", title: "核心论点", summary: "这条视频的主张" },
        { column: "support", title: "支撑一", summary: "论据" },
      ],
    },
    artifactOrigin: {
      getArtifactOrigin: async (
        _c: RequestContext,
        _projectId: string,
        artifactType: string,
      ) => (artifactType === "thesis_tree" ? thesisOrigin : null),
    },
  };
}

describe("creative-context F2 — reconstructed 论点树 brief 显式标注", () => {
  it("origin='reconstructed' → thesisBrief 前缀「未经确认」标注", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      makeDeps("reconstructed"),
    );
    expect(context.thesisBrief).toContain(RECONSTRUCTED_MARK);
    // 原内容仍在(是「标注 + 内容」,不是「排除」——下游还能读到,但不当已确认)。
    expect(context.thesisBrief).toContain("核心论点");
  });

  it("origin='user' → thesisBrief 不带「未经确认」标注(用户已确认前提)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-manual-1", topic: "" },
      makeDeps("user"),
    );
    expect(context.thesisBrief).not.toContain(RECONSTRUCTED_MARK);
    expect(context.thesisBrief).toContain("核心论点");
  });

  it("origin=null(legacy)→ thesisBrief 不带标注", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-legacy-1", topic: "" },
      makeDeps(null),
    );
    expect(context.thesisBrief).not.toContain(RECONSTRUCTED_MARK);
  });

  it("未装配 artifactOrigin reader → 降级为不标注(不阻塞节点)", async () => {
    const deps = makeDeps("reconstructed");
    delete deps.artifactOrigin;
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      deps,
    );
    // 没有 origin reader 就退回 legacy 行为(不标注),但 brief 内容仍在。
    expect(context.thesisBrief).not.toContain(RECONSTRUCTED_MARK);
    expect(context.thesisBrief).toContain("核心论点");
  });
});

// ── T-039a:复盘对象注入(reviewSubject reader → CreativeContext 复盘字段)────────────
// 复盘要「就这一条作品」提炼经验:有 projectId + 装配了 reviewSubject reader 时,assemble 必须把
// 本作品的真标题/文案/数据/评论读进 CreativeContext 的 reviewTitle/reviewScript/reviewMetrics/
// reviewComments。缺 projectId 或未装配 reader → 诚实空(不崩)。单个 reader 方法抛错只让该字段空。
describe("creative-context T-039a — 复盘作品真材料注入", () => {
  const REAL_TITLE = "上下文工程实战复盘";
  const REAL_SCRIPT = "开头三秒抛出「你的 Agent 为什么总断片」的钩子……(逐字稿正文)";
  const REAL_METRICS = "播放：52000 · 点赞：3100 · 评论：420";
  const REAL_COMMENTS = ["这个钩子太强了", "求下集怎么落地"];

  function reviewDeps(
    over: Partial<{
      getTitle: () => Promise<string>;
      getScript: () => Promise<string>;
      getMetricsSummary: () => Promise<string>;
      getComments: () => Promise<string[]>;
    }> = {},
  ): ContextDeps {
    return {
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      },
      reviewSubject: {
        getTitle: over.getTitle ?? (async () => REAL_TITLE),
        getScript: over.getScript ?? (async () => REAL_SCRIPT),
        getMetricsSummary: over.getMetricsSummary ?? (async () => REAL_METRICS),
        getComments: over.getComments ?? (async () => REAL_COMMENTS),
      },
    };
  }

  it("有 projectId + reviewSubject reader → 4 个复盘字段含真值", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      reviewDeps(),
    );
    expect(context.reviewTitle).toBe(REAL_TITLE);
    expect(context.reviewScript).toBe(REAL_SCRIPT);
    expect(context.reviewMetrics).toBe(REAL_METRICS);
    // 评论拼成「· 逐条」列表,含每条真评论文本。
    expect(context.reviewComments).toContain("这个钩子太强了");
    expect(context.reviewComments).toContain("求下集怎么落地");
    expect(context.reviewComments).toContain("· "); // 列表前缀
  });

  it("缺 projectId → 不调 reader,4 个复盘字段全空(诚实兜底,不崩)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: "随便一个主题" },
      reviewDeps(),
    );
    expect(context.reviewTitle).toBe("");
    expect(context.reviewScript).toBe("");
    expect(context.reviewMetrics).toBe("");
    expect(context.reviewComments).toBe("");
  });

  it("未装配 reviewSubject reader → 复盘字段全空(其它节点不受影响)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-1", topic: "" },
      {
        positioning: {
          getPositioningCenter: async () => ({
            profile: null,
            currentStatement: null,
          }),
        },
      },
    );
    expect(context.reviewTitle).toBe("");
    expect(context.reviewScript).toBe("");
    expect(context.reviewMetrics).toBe("");
    expect(context.reviewComments).toBe("");
  });

  it("单个 reader 方法抛错 → 只让该字段空,其余真值仍在(best-effort 隔离)", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      reviewDeps({
        getMetricsSummary: async () => {
          throw new Error("analytics down");
        },
      }),
    );
    expect(context.reviewMetrics).toBe(""); // 挂的这个空
    expect(context.reviewTitle).toBe(REAL_TITLE); // 其余不受牵连
    expect(context.reviewScript).toBe(REAL_SCRIPT);
    expect(context.reviewComments).toContain("这个钩子太强了");
  });

  it("评论里空串/空白被过滤,只保留非空真评论", async () => {
    const context = await assembleCreativeContext(
      ctx,
      { projectId: "proj-imported-1", topic: "" },
      reviewDeps({
        getComments: async () => ["  ", "", "真评论一条"],
      }),
    );
    expect(context.reviewComments).toBe("· 真评论一条");
  });
});

describe("markReconstructedBrief — 纯函数", () => {
  it("reconstructed + 非空 → 加标注", () => {
    expect(markReconstructedBrief("内容", "reconstructed")).toContain(
      RECONSTRUCTED_MARK,
    );
  });
  it("user / null → 原样返回", () => {
    expect(markReconstructedBrief("内容", "user")).toBe("内容");
    expect(markReconstructedBrief("内容", null)).toBe("内容");
    expect(markReconstructedBrief("内容", undefined)).toBe("内容");
  });
  it("空 brief → 原样返回(无内容不标)", () => {
    expect(markReconstructedBrief("", "reconstructed")).toBe("");
  });
});
