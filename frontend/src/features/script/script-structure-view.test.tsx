/**
 * ScriptStructureToggle(T-070 双视图 → T-072 结构化编辑)。
 *
 * 覆盖:
 *  - 默认视图:有 sections → 结构编辑;无 sections → 编辑(TipTap children);
 *  - 结构编辑交互:换段型徽章 / 改标题正文 / 上移下移 / 删除 / 在下方加段;
 *  - 保存:组装 sections → client.createArtifactVersion(contentText 拼接 +
 *    contentData.sections 全量,金句段强制 emphasis)→ router.refresh;
 *  - artifactId 缺省 + projectId → ensureScriptArtifact getOrCreate 再落库;
 *  - 空态:引导文案 + 「加第一段」起结构稿。
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScriptStructureToggle } from "./script-structure-view";
import {
  DraftChatRequestProvider,
  useDraftChatRequest,
} from "@/features/draft-workbench/draft-chat-request";
import type { ScriptSectionView } from "@/types/view-models";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockCreateArtifactVersion = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ id: "av-new", input }),
);
const mockListArtifacts = vi.fn(
  (_input: unknown): Promise<unknown> => Promise.resolve([]),
);
const mockCreateArtifact = vi.fn(
  (_input: unknown): Promise<unknown> => Promise.resolve({ id: "art-created" }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createArtifactVersion: (input: unknown) => mockCreateArtifactVersion(input),
    listArtifacts: (input: unknown) => mockListArtifacts(input),
    createArtifact: (input: unknown) => mockCreateArtifact(input),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockCreateArtifactVersion.mockClear();
  mockListArtifacts.mockClear();
  mockCreateArtifact.mockClear();
});

const SECTIONS: ScriptSectionView[] = [
  {
    id: "s-1",
    type: "hook",
    heading: "开场钩子",
    body: "前 3 秒直接放结论:论文能跑起来才算读懂。",
    emphasis: true,
    startSeconds: 0,
    endSeconds: 15,
  },
  {
    id: "s-2",
    type: "body",
    heading: "",
    body: "先把环境锁死,再逐模块复现。",
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  },
  {
    id: "s-3",
    type: "golden_quote",
    heading: "金句",
    body: "跑不通的 idea 只是感想。",
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  },
];

function renderToggle(
  sections: ScriptSectionView[],
  props: {
    artifactId?: string | null;
    projectId?: string | null;
    currentVersionId?: string | null;
    assetLabels?: Readonly<Record<string, string>>;
  } = {},
) {
  return render(
    <ScriptStructureToggle sections={sections} {...props}>
      <div data-testid="editor-stub">编辑器</div>
    </ScriptStructureToggle>,
  );
}

function ChatRequestProbe() {
  const { request } = useDraftChatRequest();
  return (
    <output data-testid="chat-request-probe">
      {request ? JSON.stringify(request) : ""}
    </output>
  );
}

function renderToggleWithChat(
  sections: ScriptSectionView[],
  props: {
    artifactId?: string | null;
    projectId?: string | null;
    currentVersionId?: string | null;
  },
) {
  return render(
    <DraftChatRequestProvider>
      <ScriptStructureToggle sections={sections} {...props}>
        <div data-testid="editor-stub">编辑器</div>
      </ScriptStructureToggle>
      <ChatRequestProbe />
    </DraftChatRequestProvider>,
  );
}

function sectionCards(): NodeListOf<Element> {
  return document.querySelectorAll('[data-slot="script-structure-section"]');
}

describe("ScriptStructureToggle(默认视图)", () => {
  it("有 sections → 默认结构编辑视图(徽章/标题/正文/时间字数可见);切编辑回 TipTap children", () => {
    renderToggle(SECTIONS);
    expect(
      screen.getByRole("button", { name: "纯文本稿" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "分镜脚本" }),
    ).toBeInTheDocument();
    // 默认即结构视图:编辑器 children 不渲,分段卡渲 3 张。
    expect(screen.queryByTestId("editor-stub")).toBeNull();
    expect(sectionCards()).toHaveLength(3);
    // 段型徽章 = select,展示当前段型。
    const typeSelects = document.querySelectorAll(
      '[data-slot="script-section-type"]',
    ) as NodeListOf<HTMLSelectElement>;
    expect(typeSelects[0]!.value).toBe("hook");
    expect(typeSelects[2]!.value).toBe("golden_quote");
    // 标题/正文可编辑控件承载原内容。
    expect(screen.getByDisplayValue("开场钩子")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(/前 3 秒直接放结论/),
    ).toBeInTheDocument();
    // 时间 + 字数行(第一段 0:00–0:15)。
    expect(screen.getByText(/0:00–0:15/)).toBeInTheDocument();
    // 切回编辑视图 → children 渲染。
    fireEvent.click(document.querySelector('[data-slot="script-view-edit"]')!);
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
  });

  it("无 sections → 默认编辑视图;切结构给引导空态 + 可加第一段起结构稿", () => {
    renderToggle([]);
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
    fireEvent.click(
      document.querySelector('[data-slot="script-view-structure"]')!,
    );
    expect(
      document.querySelector('[data-slot="script-structure-empty"]'),
    ).not.toBeNull();
    expect(
      screen.getByText(/让编导整稿起草会自动带分段/),
    ).toBeInTheDocument();
    // 「加第一段」→ 出一张钩子段卡,空态消失。
    fireEvent.click(
      document.querySelector('[data-slot="script-structure-add-first"]')!,
    );
    expect(
      document.querySelector('[data-slot="script-structure-empty"]'),
    ).toBeNull();
    expect(sectionCards()).toHaveLength(1);
    const select = document.querySelector(
      '[data-slot="script-section-type"]',
    ) as HTMLSelectElement;
    expect(select.value).toBe("hook");
  });
});

describe("ScriptStructureEditor(交互)", () => {
  it("换段型徽章 / 改标题正文 → 状态翻「有未保存的修改」", () => {
    renderToggle(SECTIONS);
    const typeSelect = document.querySelectorAll(
      '[data-slot="script-section-type"]',
    )[1] as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: "transition" } });
    expect(typeSelect.value).toBe("transition");

    const heading = screen.getByDisplayValue("开场钩子");
    fireEvent.change(heading, { target: { value: "更锋利的钩子" } });
    expect(screen.getByDisplayValue("更锋利的钩子")).toBeInTheDocument();

    const status = document.querySelector(
      '[data-slot="structure-save-status"]',
    )!;
    expect(status.getAttribute("data-save-status")).toBe("dirty");
    expect(screen.getByText("有未保存的修改")).toBeInTheDocument();
  });

  it("上移/下移/删除/在下方加段:段序与段数如实变化", () => {
    renderToggle(SECTIONS);
    // 第二段上移 → 「先把环境锁死…」成为第一段正文。
    const upButtons = document.querySelectorAll('[data-op-id="section-move-up"]');
    fireEvent.click(upButtons[1]!);
    let bodies = document.querySelectorAll(
      '[data-slot="script-section-body"]',
    ) as NodeListOf<HTMLTextAreaElement>;
    expect(bodies[0]!.value).toContain("先把环境锁死");
    // 第一段下移 → 换回去。
    const downButtons = document.querySelectorAll(
      '[data-op-id="section-move-down"]',
    );
    fireEvent.click(downButtons[0]!);
    bodies = document.querySelectorAll(
      '[data-slot="script-section-body"]',
    ) as NodeListOf<HTMLTextAreaElement>;
    expect(bodies[0]!.value).toContain("前 3 秒直接放结论");
    // 首段上移禁用 / 末段下移禁用。
    expect(
      (document.querySelectorAll('[data-op-id="section-move-up"]')[0] as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (document.querySelectorAll('[data-op-id="section-move-down"]')[2] as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // 在第一段下方加段 → 4 张卡,第二张是空的正文段。
    fireEvent.click(
      document.querySelectorAll('[data-op-id="section-insert-below"]')[0]!,
    );
    expect(sectionCards()).toHaveLength(4);
    const newSelect = document.querySelectorAll(
      '[data-slot="script-section-type"]',
    )[1] as HTMLSelectElement;
    expect(newSelect.value).toBe("body");
    // 删除新加的段 → 回 3 张。
    fireEvent.click(
      document.querySelectorAll('[data-op-id="section-remove"]')[1]!,
    );
    expect(sectionCards()).toHaveLength(3);
  });
});

describe("ScriptStructureEditor(保存)", () => {
  it("保存 → createArtifactVersion 带 contentText 拼接 + contentData.sections 全量(金句强制 emphasis)→ refresh", async () => {
    renderToggle(SECTIONS, { artifactId: "art-1" });
    // 改第一段标题制造 dirty,解锁保存。
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "v3 钩子" },
    });
    const saveBtn = document.querySelector(
      '[data-slot="structure-save-button"]',
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
    fireEvent.click(saveBtn);

    await screen.findByText("已保存");
    expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1);
    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: {
        contentText: string;
        changeSummary: string;
        contentData: { sections: Array<Record<string, unknown>>; html?: unknown };
      };
    };
    expect(input.params.artifactId).toBe("art-1");
    expect(input.body.changeSummary).toBe("结构编辑");
    // 不写 html:读侧从新 sections 重拼,避免结构改动被旧富文本盖掉。
    expect(input.body.contentData.html).toBeUndefined();
    const sections = input.body.contentData.sections;
    expect(sections).toHaveLength(3);
    expect(sections[0]).toMatchObject({
      type: "hook",
      heading: "v3 钩子",
      emphasis: true,
      startSeconds: 0,
      endSeconds: 15,
    });
    // 金句段:emphasis 未标也强制 true(段型语义)。
    expect(sections[2]).toMatchObject({ type: "golden_quote", emphasis: true });
    // contentText = heading\nbody 段间双换行拼接。
    expect(input.body.contentText).toContain("v3 钩子\n前 3 秒直接放结论");
    expect(input.body.contentText).toContain("\n\n");
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("artifactId 缺省 + projectId → ensureScriptArtifact getOrCreate 再落库(首存不假成功)", async () => {
    renderToggle(SECTIONS, { artifactId: null, projectId: "proj-1" });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "首存钩子" },
    });
    fireEvent.click(
      document.querySelector('[data-slot="structure-save-button"]')!,
    );
    await screen.findByText("已保存");
    // getOrCreate:先 list(空)→ create → 用新建 id 落版本。
    expect(mockListArtifacts).toHaveBeenCalled();
    expect(mockCreateArtifact).toHaveBeenCalled();
    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
    };
    expect(input.params.artifactId).toBe("art-created");
  });

  it("[T-732] 保存携带当前版本并发锚点，禁止旧稿覆盖刚写入的新整稿", async () => {
    renderToggle(SECTIONS, {
      artifactId: "art-1",
      currentVersionId: "version-6",
    });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "基于 v6 的本地修改" },
    });
    fireEvent.click(
      document.querySelector('[data-slot="structure-save-button"]')!,
    );
    await screen.findByText("已保存");

    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      body: { expectedCurrentVersionId?: string };
    };
    expect(input.body.expectedCurrentVersionId).toBe("version-6");
  });

  it("全部段清空 → 保存禁用并提示,不产空版本", () => {
    renderToggle([SECTIONS[0]!], { artifactId: "art-1" });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "" },
    });
    fireEvent.change(
      document.querySelector('[data-slot="script-section-body"]')!,
      { target: { value: "" } },
    );
    const saveBtn = document.querySelector(
      '[data-slot="structure-save-button"]',
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(
      screen.getByText(/至少留一段有内容的段落才能保存/),
    ).toBeInTheDocument();
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });
});

describe("[T-716] AI 改写本段", () => {
  it("点击按钮自动携带稿件/版本/段落/原文锚点，不让模型或用户补技术 ID", async () => {
    renderToggleWithChat(SECTIONS, {
      artifactId: "artifact-1",
      currentVersionId: "version-6",
    });

    fireEvent.click(screen.getByRole("button", { name: "AI 改写第 2 段" }));

    await waitFor(() => {
      const raw = screen.getByTestId("chat-request-probe").textContent || "";
      expect(raw).not.toBe("");
      const request = JSON.parse(raw) as {
        functionKey: string;
        selection: Record<string, string | number>;
      };
      expect(request.functionKey).toBe("script.patch");
      expect(request.selection).toMatchObject({
        kind: "script_section",
        id: "s-2",
        artifactId: "artifact-1",
        versionId: "version-6",
        sectionIndex: 1,
        excerpt: "先把环境锁死,再逐模块复现。",
      });
    });
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });

  it("[T-732] 整稿换版后段落与版本作为同一快照重绑，再点击只发送新版本正文", async () => {
    const currentSections = SECTIONS.map((section, index) => ({
      ...section,
      id: `current-${index + 1}`,
      body: `当前 v10 第 ${index + 1} 段正文`,
    }));
    const rendered = renderToggleWithChat(SECTIONS, {
      artifactId: "artifact-1",
      currentVersionId: "version-9",
    });

    rendered.rerender(
      <DraftChatRequestProvider>
        <ScriptStructureToggle
          sections={currentSections}
          artifactId="artifact-1"
          currentVersionId="version-10"
        >
          <div data-testid="editor-stub">编辑器</div>
        </ScriptStructureToggle>
        <ChatRequestProbe />
      </DraftChatRequestProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("第 2 段正文")).toHaveValue(
        "当前 v10 第 2 段正文",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "AI 改写第 2 段" }));

    await waitFor(() => {
      const request = JSON.parse(
        screen.getByTestId("chat-request-probe").textContent || "{}",
      ) as { selection?: Record<string, string | number> };
      expect(request.selection).toMatchObject({
        id: "current-2",
        artifactId: "artifact-1",
        versionId: "version-10",
        sectionIndex: 1,
        excerpt: "当前 v10 第 2 段正文",
      });
    });
  });

  it("本地段落有未保存修改时先自动保存，再用新版本和新原文打开局部改写", async () => {
    renderToggleWithChat(SECTIONS, {
      artifactId: "artifact-1",
      currentVersionId: "version-6",
    });
    fireEvent.change(screen.getByLabelText("第 2 段正文"), {
      target: { value: "这是刚刚在稿面改过、还没手动保存的新原文。" },
    });

    fireEvent.click(screen.getByRole("button", { name: "AI 改写第 2 段" }));

    await waitFor(() => expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1));
    const saved = mockCreateArtifactVersion.mock.calls[0]![0] as {
      body: { changeSummary: string };
    };
    expect(saved.body.changeSummary).toBe("AI 局部改稿前自动保存");

    await waitFor(() => {
      const request = JSON.parse(
        screen.getByTestId("chat-request-probe").textContent || "{}",
      ) as { selection?: Record<string, string | number> };
      expect(request.selection).toMatchObject({
        id: "s-2",
        artifactId: "artifact-1",
        versionId: "av-new",
        sectionIndex: 1,
        excerpt: "这是刚刚在稿面改过、还没手动保存的新原文。",
      });
    });
  });
});

// ── [T-387b] 凝固分镜 visual:渲染 + 保存透传 ─────────────────────────────────

describe("ScriptStructureEditor(凝固分镜 visual)", () => {
  const WITH_VISUAL: ScriptSectionView[] = [
    {
      ...SECTIONS[0]!,
      visual: {
        description: "产品操作录屏特写",
        assetRefs: ["asset-9"],
        missing: ["对比图表"],
      },
    },
    SECTIONS[1]!,
  ];

  it("有 visual 的段渲画面描述/点名素材/缺素材;无 visual 的段不渲(旧稿零回归)", () => {
    renderToggle(WITH_VISUAL, {
      artifactId: "art-1",
      assetLabels: { "asset-9": "选题卡操作录屏.mov" },
    });
    const blocks = document.querySelectorAll(
      '[data-slot="script-section-visual"]',
    );
    expect(blocks).toHaveLength(1); // 只有第一段有
    expect(blocks[0]!.textContent).toContain("产品操作录屏特写");
    expect(blocks[0]!.textContent).toContain("选题卡操作录屏.mov");
    expect(blocks[0]!.textContent).not.toContain("asset-9");
    expect(blocks[0]!.textContent).toContain("对比图表");
  });

  it("结构编辑保存 → visual 原样带回(不洗掉分镜真源);无 visual 的段不带字段", async () => {
    renderToggle(WITH_VISUAL, { artifactId: "art-1" });
    fireEvent.change(screen.getByDisplayValue("开场钩子"), {
      target: { value: "改标题" },
    });
    fireEvent.click(
      document.querySelector('[data-slot="structure-save-button"]')!,
    );
    await screen.findByText("已保存");
    const input = mockCreateArtifactVersion.mock.calls[0]![0] as {
      body: { contentData: { sections: Array<Record<string, unknown>> } };
    };
    const sections = input.body.contentData.sections;
    expect(sections[0]!.visual).toEqual({
      description: "产品操作录屏特写",
      assetRefs: ["asset-9"],
      missing: ["对比图表"],
    });
    expect(sections[1]!.visual).toBeUndefined();
  });
});
