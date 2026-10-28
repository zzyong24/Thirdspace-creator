import { describe, it, expect, vi } from "vitest";
import "@/styles/creatoros-studio.css";
import { fireEvent, render, screen } from "@testing-library/react";

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
  ReviewSoftGateHint: () => <div data-slot="mock-review-soft-gate" />,
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
  WorkCreationCta: () => <div data-slot="mock-work-creation" />,
}));
vi.mock("./thesis-skeleton-panel", () => ({
  ThesisSkeletonPanel: () => <div data-slot="mock-thesis-skeleton" />,
}));
vi.mock("./ammo-note-form", () => ({ AmmoNoteForm: () => null }));
vi.mock("./ammo-dump-zone", () => ({ AmmoDumpZone: () => null }));
vi.mock("./ammo-card-list", () => ({
  AmmoCardList: ({ ammo }: { ammo: ReadonlyArray<{ id: string; title: string; kind: string }> }) => (
    <div data-slot="mock-ammo-list">{ammo.length} 条</div>
  ),
}));
vi.mock("./draft-primary-action", () => ({
  DraftPrimaryAction: ({ published }: { published: boolean }) => (
    <div
      data-slot="mock-primary-action"
      data-published={String(published)}
    />
  ),
}));
// [T-374] 顶条「立即抓取逐字稿」:mock 成可探测占位(真组件拉 contract-client)。
vi.mock("./transcribe-now-button", () => ({
  TranscribeNowButton: ({ projectId, awemeId, initialState }: { projectId: string; awemeId: string; initialState: string }) => (
    <div data-slot="mock-transcribe-now" data-project-id={projectId} data-aweme-id={awemeId} data-initial-state={initialState} />
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
  useDraftChatRequest: () => ({
    openChat: vi.fn(),
    flushSave: vi.fn(async () => undefined),
  }),
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

it("T-1382 未采纳的来源初稿不能成为编辑器初值", () => {
  const { container } = render(<DraftWorkbenchPage vm={baseVm({radarDraftSeed:"尚未采纳的来源候选"})} />);
  expect(container.querySelector('[data-slot="mock-rich-editor"]')).toHaveAttribute("data-initial-html", "");
}, 120000);

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

  it("携带内容雷达证据的项目仍使用单稿编辑器，候选不自动初始化口播稿", () => {
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
    ).toBe("");
  });

  it("来源原稿暂时读不到时，不用雷达候选冒充正式稿", () => {
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
    ).toBe("");
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

describe("DraftWorkbenchPage — T-738 发布物料查看闭环", () => {
  it("已发布的持久化物料仍在原稿面提供查看，不跳转发布中心", () => {
    render(
      <DraftWorkbenchPage
        vm={baseVm({
          publishUnlocked: true,
          publishPack: {
            publicationId: "publication-1",
            platform: "douyin",
            status: "published",
            publishedAt: "2026-08-09T10:00:00.000Z",
            title: "正式发布标题",
            description: "正式发布正文",
            tags: ["AI提效"],
            hasCover: false,
            coverAssetId: null,
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "查看发布物料" }));
    expect(screen.getByRole("dialog").textContent).toContain("正式发布正文");
    expect(screen.queryByText("生成发布物料")).toBeNull();
    expect(screen.getByRole("dialog").textContent).not.toContain("发布中心");
  });

  it("查看生成物料时保留同作品已发布状态，不重复出现登记入口", () => {
    render(
      <DraftWorkbenchPage
        vm={baseVm({
          publishUnlocked: true,
          publishPack: {
            publicationId: "publication-package",
            platform: "douyin",
            status: "draft",
            publishedAt: null,
            title: "生成物料标题",
            description: "生成物料简介",
            tags: ["AI提效"],
            hasCover: false,
            coverAssetId: null,
            outputPublished: true,
            latestPublishedAt: "2026-08-12T05:16:48.494Z",
          },
        })}
      />,
    );

    expect(screen.getByText(/已发布 · 2026-08-12/)).toBeTruthy();
    expect(screen.queryByText("登记已发布")).toBeNull();
    expect(
      document
        .querySelector('[data-slot="mock-primary-action"]')
        ?.getAttribute("data-published"),
    ).toBe("true");
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
  it("有 douyinExternalId 也不绕过preparation另起转写", () => {
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
    expect(btn).toBeNull();
    expect(container.querySelector('[data-slot="project-pipeline"]')).not.toBeNull();
  });

  it("已有逐字稿不凭前端平台锚伪造准备步骤", () => {
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
    const entry = container.querySelector('[data-slot="mock-transcribe-now"]');
    expect(entry).toBeNull();
    expect(container.textContent).not.toContain("升级时已完成转写");
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
it("T-1021 没有口播脚本也能查看已有图文物料，不开放新生成",()=>{
 render(<DraftWorkbenchPage vm={baseVm({publishPack:{publicationId:'pub-a',revisionId:'rev-a',platform:'xiaohongshu',status:'draft',publishedAt:null,title:'已采纳图文',description:'真实图文配文',tags:[],hasCover:false,coverAssetId:null},publishUnlocked:false})}/>);
 expect(screen.getByRole('button',{name:'查看发布物料'})).toBeVisible();expect(screen.queryByRole('button',{name:'生成发布物料'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'查看发布物料'}));expect(screen.getByRole('dialog')).toHaveTextContent('真实图文配文');
});


describe("DraftWorkbenchPage — T-1055 顶条仅保留真实动作", () => {
  it("普通未发布稿删除重复入口及整个空顶条", () => {
    const {container} = render(<DraftWorkbenchPage vm={baseVm()} />);
    expect(screen.queryByRole("link", {name: "项目作品与创作"})).toBeNull();
    expect(container.querySelector('[data-slot="draft-topbar"]')).toBeNull();
  });
  it("导入徽标仍在真实顶条，重复入口不出现", () => {
    const original = baseVm();
    const vm = baseVm({project: {...original.project, imported: true}});
    const {container} = render(<DraftWorkbenchPage vm={vm} />);
    expect(container.querySelector('[data-slot="draft-topbar"]')).not.toBeNull();
    expect(screen.getByText("真实导入作品")).toBeTruthy();
    expect(screen.queryByRole("link", {name: "项目作品与创作"})).toBeNull();
  });
  it("项目准备入口保留，顶条不另起逐字稿任务", () => {
    const original = baseVm();
    const vm = baseVm({project: {...original.project, douyinExternalId: "douyin-1", transcriptState: "queued"}});
    const {container} = render(<DraftWorkbenchPage vm={vm} />);
    expect(container.querySelector('[data-slot="project-pipeline"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="project-pipeline"] [data-step="transcript"] [data-slot="mock-transcribe-now"]')).toBeNull();
    expect(container.querySelector('[data-slot="draft-topbar"] [data-slot="mock-transcribe-now"]')).toBeNull();
  });
  it("明确未发布不会被旧 published 包状态误判", () => {
    const vm = baseVm({publishPack: {publicationId: "pub-1", platform: "douyin", status: "published", outputPublished: false,
      publishedAt: null, title: "标题", description: "简介", tags: [], hasCover: false, coverAssetId: null}});
    const {container} = render(<DraftWorkbenchPage vm={vm} />);
    expect(container.querySelector('[data-slot="draft-topbar"]')).toBeNull();
  });
});

// T-1379：CSS视觉顺序与DOM一致，不把脚本重排到项目准备之前。
it("普通项目首屏按项目准备、脚本顺序展示且没有负排序", () => {
  const { container } = render(<div data-design="manuscript"><DraftWorkbenchPage vm={baseVm()} /></div>);
  const pipeline = container.querySelector('[data-slot="project-pipeline"]')!;
  const script = container.querySelector('[data-slot="draft-script-section"]')!;
  expect(pipeline.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(Number(getComputedStyle(script).order || 0)).toBeGreaterThanOrEqual(Number(getComputedStyle(pipeline).order || 0));
  expect(script.id).toBe("script");
});

// T-1070：一键生成读取已确认脚本，按操作顺序位于脚本区之后、发布之前；写稿前只留准备入口。
it("一键生成文章和图文在脚本区之后、发布区之前，准备入口在脚本区之前", () => {
  const { container } = render(<DraftWorkbenchPage vm={baseVm()} />);
  const prepare = container.querySelector('[data-slot="mock-flow-ctas"]')!;
  const script = container.querySelector('[data-slot="draft-script-section"]')!;
  const generate = container.querySelector('[data-slot="mock-work-creation"]')!;
  const publish = container.querySelector('[data-slot="draft-publish-pack"]')!;
  expect(prepare.compareDocumentPosition(script) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(script.contains(generate)).toBe(false);
  expect(script.compareDocumentPosition(generate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(generate.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
