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
