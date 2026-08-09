import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// [Bug-8 T-021] 口播脚本 section 的副行文案对 imported 项目要给出针对性引导,
// 不能误导成「直接开写」(用户压根没创建过这项目,是从抖音导入的)。

// mock 重 child components(避免拉整条 ScriptStructureToggle / ScriptRichEditor 的依赖树)。
vi.mock("@/features/script/script-rich-editor", () => ({
  ScriptRichEditor: ({ initialHtml }: { initialHtml: string }) => (
    <div data-slot="mock-rich-editor" data-initial-html={initialHtml} />
  ),
}));
vi.mock("@/features/script/script-structure-view", () => ({
  ScriptStructureToggle: ({ children }: { children: React.ReactNode }) => (
    <div data-slot="mock-structure-toggle">{children}</div>
  ),
}));
vi.mock("./script-review-gate", () => ({
  ScriptReviewGate: () => <div data-slot="mock-review-gate" />,
}));
vi.mock("@/components/resources/cover-thumb", () => ({
  CoverThumb: ({ assetId }: { assetId: string | null }) => (
    <div data-slot="mock-cover-thumb" data-asset-id={assetId ?? ""} />
  ),
}));
vi.mock("./topic-card", () => ({
  TopicCard: () => <div data-slot="mock-topic-card" />,
}));
vi.mock("./creation-flow-ctas", () => ({
  CreationFlowCtas: () => <div data-slot="mock-flow-ctas" />,
}));
vi.mock("./ammo-note-form", () => ({ AmmoNoteForm: () => null }));
vi.mock("./ammo-dump-zone", () => ({ AmmoDumpZone: () => null }));
vi.mock("./ammo-card-list", () => ({
  AmmoCardList: ({ ammo }: { ammo: ReadonlyArray<{ id: string; title: string; kind: string }> }) => (
    <div data-slot="mock-ammo-list">{ammo.length} 条</div>
  ),
}));
vi.mock("./draft-primary-action", () => ({
  DraftPrimaryAction: () => <div data-slot="mock-primary-action" />,
}));
// [T-374] 顶条「立即抓取逐字稿」:mock 成可探测占位(真组件拉 contract-client)。
vi.mock("./transcribe-now-button", () => ({
  TranscribeNowButton: ({ projectId }: { projectId: string }) => (
    <div data-slot="mock-transcribe-now" data-project-id={projectId} />
  ),
}));
vi.mock("./register-published-form", () => ({
  RegisterPublishedForm: () => null,
}));
vi.mock("./blind-predict-row", () => ({
  BlindPredictRow: () => null,
}));
vi.mock("./draft-chat-rail", () => ({ DraftChatRail: () => null }));
vi.mock("./draft-chat-request", () => ({
  DraftChatRequestProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));
vi.mock("./draft-resizable-layout", () => ({
  DraftResizableLayout: ({
    left,
    right,
  }: {
    left: React.ReactNode;
    right: React.ReactNode;
  }) => (
    <div>
      <div data-slot="left">{left}</div>
      <div data-slot="right">{right}</div>
    </div>
  ),
}));

import {
  DraftWorkbenchPage,
  collectMissingMaterials,
} from "./draft-workbench-page";
import type { DraftWorkbenchVm } from "./draft-workbench-data";

function baseVm(overrides: Partial<DraftWorkbenchVm> = {}): DraftWorkbenchVm {
  return {
    project: {
      id: "p-1",
      title: "已导入作品",
      brief: "",
      briefDetail: null,
      currentStage: "review",
      imported: false,
      douyinExternalId: null,
      transcriptState: "idle",
    },
    scriptArtifactId: null,
    outputId: "out-1",
    script: { editorHtml: null, sections: [], versionCount: 0 },
    radarDraftSeed: null,
    publishPack: null,
    projectCoverAssetId: null,
    publishUnlocked: false,
    blindPrediction: null,
    ammo: [],
    scriptReview: null,
    thesis: null,
    ...overrides,
  } as DraftWorkbenchVm;
}

describe("DraftWorkbenchPage — Bug-8 T-021 口播脚本副行文案", () => {
  it("非 imported + versionCount=0 → 老文案(直接开写 / 编导起草)", () => {
    render(<DraftWorkbenchPage vm={baseVm()} />);
    const section = screen.getByText(/口播脚本/);
    // 同一区头下,副行文案应给「自己写的」语义。
    const hint = section.parentElement?.textContent ?? "";
    expect(hint).toContain("写你的口播稿");
    expect(hint).not.toContain("本作品从抖音导入");
  });

  it("[Bug-8 T-021 二次] imported + versionCount=0 → 用户视角,透明「系统会处理」+「不想等就现在 AI 起草」,不暴露内部", () => {
    render(
      <DraftWorkbenchPage
        vm={baseVm({
          project: {
            id: "p-1",
            title: "已导入作品",
            brief: "",
            briefDetail: null,
            currentStage: "review",
            imported: true,
            douyinExternalId: null,
            transcriptState: "idle",
          },
        })}
      />,
    );
    const section = screen.getByText(/口播脚本/);
    const hint = section.parentElement?.textContent ?? "";
    // 透明给用户:系统会自动拉逐字稿(无需操作),着急就先让 AI 起草。
    expect(hint).toContain("抖音");
    expect(hint).toContain("系统"); // "系统会..." 透明承诺
    expect(hint).toContain("编导");
    // **不**说 PM 术语(自动入队/后台/任务/in-flight 之类)
    expect(hint).not.toContain("自动入队");
    expect(hint).not.toContain("后台");
    expect(hint).not.toContain("任务");
    // 不引导用户去「自动化」手动触发(T-151 已自动),不引导去「配 ASR」(T-160 已自动)。
    expect(hint).not.toContain("自动化");
    expect(hint).not.toContain("配 ASR");
    expect(hint).not.toContain("「拉逐字稿」");
  });

  it("imported + versionCount>0 → 老文案(已有稿,提示「写/存/回滚」)", () => {
    render(
      <DraftWorkbenchPage
        vm={baseVm({
          project: {
            id: "p-1",
            title: "已导入作品",
            brief: "",
            briefDetail: null,
            currentStage: "review",
            imported: true,
            douyinExternalId: null,
            transcriptState: "idle",
          },
          script: { editorHtml: "<p>已有稿</p>", sections: [], versionCount: 1 },
        })}
      />,
    );
    const section = screen.getByText(/口播脚本/);
    const hint = section.parentElement?.textContent ?? "";
    expect(hint).toContain("v1");
    expect(hint).toContain("写你的口播稿");
  });
});

describe("DraftWorkbenchPage — T-642 按选题来源分流", () => {
  it("直接创建的普通选题项目保持单稿编辑器，不显示对标原稿，也不注入雷达初稿", () => {
    const { container } = render(<DraftWorkbenchPage vm={baseVm()} />);

    expect(
      container.querySelector('[data-slot="radar-script-comparison"]'),
    ).toBeNull();
    expect(
      container
        .querySelector('[data-slot="mock-rich-editor"]')
        ?.getAttribute("data-initial-html"),
    ).toBe("");
  });

  it("携带内容雷达证据的项目仍使用单稿编辑器，并用改写初稿初始化口播稿", () => {
    const { container } = render(
      <DraftWorkbenchPage
        vm={baseVm({
          radarDraftSeed: "我的改写初稿",
        })}
      />,
    );

    expect(
      container.querySelector('[data-slot="radar-script-comparison"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("对标原稿");
    expect(
      container
        .querySelector('[data-slot="mock-rich-editor"]')
        ?.getAttribute("data-initial-html"),
    ).toBe("<p>我的改写初稿</p>");
  });

  it("来源原稿暂时读不到时，雷达改写稿仍直接填进现有编辑器", () => {
    const { container } = render(
      <DraftWorkbenchPage
        vm={baseVm({
          radarDraftSeed: "已经在内容雷达确认的改写稿",
        })}
      />,
    );

    expect(
      container.querySelector('[data-slot="radar-script-comparison"]'),
    ).toBeNull();
    expect(
      container
        .querySelector('[data-slot="mock-rich-editor"]')
        ?.getAttribute("data-initial-html"),
    ).toBe("<p>已经在内容雷达确认的改写稿</p>");
  });

  it("雷达项目已有正式稿件版本时，以正式稿为准，不被初稿覆盖", () => {
    const { container } = render(
      <DraftWorkbenchPage
        vm={baseVm({
          radarDraftSeed: "雷达初稿",
          script: {
            editorHtml: "<p>用户已保存的正式稿</p>",
            sections: [],
            versionCount: 1,
          },
        })}
      />,
    );

    expect(
      container
        .querySelector('[data-slot="mock-rich-editor"]')
        ?.getAttribute("data-initial-html"),
    ).toBe("<p>用户已保存的正式稿</p>");
  });
});

describe("DraftWorkbenchPage — T-660 已采纳项目封面", () => {
  it("尚未创建发布行时，也展示项目已采纳的封面", () => {
    const { container } = render(
      <DraftWorkbenchPage
        vm={baseVm({ projectCoverAssetId: "asset-cover-1" })}
      />,
    );

    expect(
      container
        .querySelector('[data-slot="mock-cover-thumb"]')
        ?.getAttribute("data-asset-id"),
    ).toBe("asset-cover-1");
    expect(container.textContent).not.toContain("封面待生成");
  });
});

// [T-488] 导出只保留在制作阶段，脚本阶段不再重复占用一整条顶栏。
describe("DraftWorkbenchPage — T-488 移除脚本阶段导出素材包", () => {
  it("顶条不再渲染导出按钮或 Finder 按钮", () => {
    const { container } = render(<DraftWorkbenchPage vm={baseVm()} />);
    expect(container.textContent).not.toContain("导出素材包");
    expect(
      container.querySelector('[data-slot="draft-reveal-project"]'),
    ).toBeNull();
  });
});

// [T-374] 顶条「立即抓取逐字稿」按钮门:有抖音锚(douyinExternalId)才渲染。
describe("DraftWorkbenchPage — T-374 顶条立抓逐字稿按钮门", () => {
  it("有 douyinExternalId → 渲染按钮(带 projectId)", () => {
    const { container } = render(
      <DraftWorkbenchPage
        vm={baseVm({
          project: {
            id: "p-1",
            title: "已导入作品",
            brief: "",
            briefDetail: null,
            currentStage: "review",
            imported: true,
            douyinExternalId: "aweme-1",
            transcriptState: "idle",
          },
        })}
      />,
    );
    const btn = container.querySelector('[data-slot="mock-transcribe-now"]');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("data-project-id")).toBe("p-1");
  });

  it("已有逐字稿 → 即使有抖音锚也不再渲染二次抓取入口", () => {
    const { container } = render(
      <DraftWorkbenchPage
        vm={baseVm({
          project: {
            ...baseVm().project,
            imported: true,
            douyinExternalId: "aweme-1",
            transcriptState: "done",
          },
        })}
      />,
    );
    expect(
      container.querySelector('[data-slot="mock-transcribe-now"]'),
    ).toBeNull();
  });

  it("无 douyinExternalId(手动项目)→ 不渲染(诚实,无锚无法抓)", () => {
    const { container } = render(<DraftWorkbenchPage vm={baseVm()} />);
    expect(
      container.querySelector('[data-slot="mock-transcribe-now"]'),
    ).toBeNull();
  });
});
// ── [T-387b] 缺素材清单(凝固分镜 missing 汇总)────────────────────────────────

describe("DraftWorkbenchPage — T-387b 缺素材清单", () => {
  it("collectMissingMaterials:各段 visual.missing 汇总去重;无 visual → []", () => {
    expect(
      collectMissingMaterials([
        { visual: { missing: ["产品操作录屏", "对比图表"] } },
        { visual: { missing: ["产品操作录屏"] } },
        {},
      ]),
    ).toEqual(["产品操作录屏", "对比图表"]);
    expect(collectMissingMaterials([{}, { visual: { missing: [] } }])).toEqual(
      [],
    );
  });

  it("脚本有凝固 missing → 渲「缺素材清单」条(带搜/传引导);无 → 不渲(零回归)", () => {
    const sections = [
      {
        id: "s-1",
        type: "hook" as const,
        heading: "钩子",
        body: "口播",
        emphasis: false,
        startSeconds: null,
        endSeconds: null,
        visual: {
          description: "d",
          assetRefs: [],
          missing: ["产品操作录屏"],
        },
      },
    ];
    const { container, rerender } = render(
      <DraftWorkbenchPage
        vm={baseVm({
          script: { editorHtml: null, sections, versionCount: 1 } as never,
        })}
      />,
    );
    const note = container.querySelector('[data-slot="draft-missing-materials"]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain("产品操作录屏");
    expect(note!.textContent).toContain("联网找资料");
    expect(note!.textContent).toContain("上传 / 管理素材");

    rerender(<DraftWorkbenchPage vm={baseVm()} />);
    expect(
      container.querySelector('[data-slot="draft-missing-materials"]'),
    ).toBeNull();
  });
});
