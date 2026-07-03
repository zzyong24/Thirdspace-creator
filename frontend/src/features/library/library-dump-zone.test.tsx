/**
 * LibraryDumpZone 交互测试([T-063d] 库融合深度版)。mock contract client 与
 * fetch(/api/knowledge/classify + PUT 字节),覆盖:
 *  - 分流判定:二进制 → 素材流(知识道禁用),.txt/.md → 知识流;
 *  - 素材落库链:staged 确认 → createUpload(不挂项目)→ completeUpload →
 *    asset.classify 排队 → refresh + 落点提示「素材」tab;
 *  - 知识落库链:文本 → 归类 → 确认门卡片 → createKnowledge → refresh +
 *    落点提示「知识」tab;
 *  - 改道:staged .txt 切「这是素材」走上传链;文本切「这是素材」包成 .txt 上传;
 *  - 失败保留 [gate-F2]:归类失败/上传失败 → 内联错误,输入与暂存保留;
 *  - 记经验:「记一条经验」开头 → Copilot 深链主动作;「记经验」按钮常驻。
 */

import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const createUpload = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ uploadId: "up-1", uploadUrl: "mock://up-1" }),
);
const completeUpload = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "asset-1" }),
);
const createAITask = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "task-1" }),
);
const createKnowledge = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "k-1" }),
);
const listTags = vi.fn((_input: unknown): Promise<unknown> => Promise.resolve([]));
const createTag = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "tag-1" }),
);
const assignTags = vi.fn((_input: unknown): Promise<unknown> => Promise.resolve({}));

vi.mock("@/lib/contract-client", () => ({
  client: {
    createUpload: (input: unknown) => createUpload(input),
    completeUpload: (input: unknown) => completeUpload(input),
    createAITask: (input: unknown) => createAITask(input),
    createKnowledge: (input: unknown) => createKnowledge(input),
    listTags: (input: unknown) => listTags(input),
    createTag: (input: unknown) => createTag(input),
    assignTags: (input: unknown) => assignTags(input),
  },
}));

import { LibraryDumpZone, autoRouteForFile } from "./library-dump-zone";

const fetchMock = vi.fn();

beforeEach(() => {
  for (const fn of [
    mockRouter.refresh,
    mockRouter.push,
    createUpload,
    completeUpload,
    createAITask,
    createKnowledge,
    listTags,
    createTag,
    assignTags,
  ]) {
    fn.mockClear();
  }
  completeUpload.mockImplementation(() => Promise.resolve({ id: "asset-1" }));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function q<T extends Element>(container: HTMLElement, slot: string): T | null {
  return container.querySelector<T>(`[data-slot="${slot}"]`);
}

function dropFiles(container: HTMLElement, files: File[]) {
  const input = q<HTMLTextAreaElement>(container, "library-dump-input")!;
  fireEvent.drop(input, { dataTransfer: { files, types: ["Files"] } });
}

function classifyOk(classification: Record<string, unknown>) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ classification }),
  });
}

describe("LibraryDumpZone — 分流判定", () => {
  it("autoRouteForFile:文本类 → knowledge,二进制 → asset", () => {
    expect(
      autoRouteForFile(new File(["x"], "note.md", { type: "text/markdown" })),
    ).toBe("knowledge");
    expect(
      autoRouteForFile(new File(["x"], "plain.txt", { type: "" })),
    ).toBe("knowledge");
    expect(
      autoRouteForFile(new File([new Uint8Array([1])], "shot.png", { type: "image/png" })),
    ).toBe("asset");
  });

  it("拖入二进制文件 → 暂存卡分流为素材,知识道禁用(诚实:读不出文本)", () => {
    const { container } = render(<LibraryDumpZone />);
    dropFiles(container, [
      new File([new Uint8Array([1, 2])], "shot.png", { type: "image/png" }),
    ]);
    const staged = q<HTMLLIElement>(container, "library-dump-staged-file")!;
    expect(staged.getAttribute("data-route")).toBe("asset");
    const knowledgeOpt = staged.querySelector<HTMLButtonElement>(
      '[data-route-option="knowledge"]',
    )!;
    expect(knowledgeOpt.disabled).toBe(true);
  });

  it("拖入 .txt → 暂存卡分流为知识,确认后文本读入输入区(不上传)", async () => {
    const { container } = render(<LibraryDumpZone />);
    dropFiles(container, [new File(["文件里的内容"], "note.txt", { type: "text/plain" })]);
    const staged = q<HTMLLIElement>(container, "library-dump-staged-file")!;
    expect(staged.getAttribute("data-route")).toBe("knowledge");

    fireEvent.click(q<HTMLButtonElement>(container, "library-dump-stage-confirm")!);
    const input = q<HTMLTextAreaElement>(container, "library-dump-input")!;
    await waitFor(() => expect(input.value).toContain("文件里的内容"));
    expect(createUpload).not.toHaveBeenCalled();
    // 暂存卡清空
    expect(q(container, "library-dump-staged-file")).toBeNull();
  });
});

describe("LibraryDumpZone — 素材落库链", () => {
  it("二进制确认入库 → createUpload(不挂项目)→ completeUpload → asset.classify 排队 → refresh + 落点提示", async () => {
    const { container } = render(<LibraryDumpZone />);
    dropFiles(container, [
      new File([new Uint8Array([1, 2])], "shot.png", { type: "image/png" }),
    ]);
    fireEvent.click(q<HTMLButtonElement>(container, "library-dump-stage-confirm")!);

    await waitFor(() => expect(completeUpload).toHaveBeenCalledTimes(1));
    // 通用素材:body 不带 projectId,原名保真
    expect(createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          assetType: "image",
          fileName: "shot.png",
        }),
      }),
    );
    const uploadBody = (
      createUpload.mock.calls[0]![0] as unknown as { body: Record<string, unknown> }
    ).body;
    expect(uploadBody.projectId).toBeUndefined();
    // AI 归类排队(fire-and-forget)
    await waitFor(() =>
      expect(createAITask).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ taskType: "asset.classify" }),
        }),
      ),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    const notice = q(container, "library-dump-notice");
    expect(notice?.textContent).toContain("素材");
    expect(q(container, "library-dump-staged-file")).toBeNull();
  });

  it("上传失败 → 内联错误,暂存保留(phase=error)可重试 [gate-F2]", async () => {
    completeUpload.mockImplementation(() => Promise.reject(new Error("boom")));
    const { container } = render(<LibraryDumpZone />);
    dropFiles(container, [
      new File([new Uint8Array([1])], "shot.png", { type: "image/png" }),
    ]);
    fireEvent.click(q<HTMLButtonElement>(container, "library-dump-stage-confirm")!);

    await waitFor(() =>
      expect(q(container, "library-dump-error")).not.toBeNull(),
    );
    const staged = q<HTMLLIElement>(container, "library-dump-staged-file")!;
    expect(staged.getAttribute("data-phase")).toBe("error");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});

describe("LibraryDumpZone — 知识落库链(确认门)", () => {
  it("倒文本 → 归类 → 确认卡 → 存入知识库 → createKnowledge + refresh + 落点提示「知识」", async () => {
    classifyOk({
      knowledgeType: "snippet",
      title: "Hook 模板",
      tags: ["Hook"],
      summary: "开头钩子。",
    });
    const { container } = render(<LibraryDumpZone />);
    fireEvent.change(q<HTMLTextAreaElement>(container, "library-dump-input")!, {
      target: { value: "前 3 秒放结论" },
    });
    fireEvent.click(q<HTMLButtonElement>(container, "library-dump-classify")!);

    await waitFor(() =>
      expect(q(container, "knowledge-classify-card")).not.toBeNull(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/knowledge/classify",
      expect.objectContaining({ method: "POST" }),
    );
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-classify-save")!);
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1));
    expect(createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          title: "Hook 模板",
          knowledgeType: "snippet",
          content: "前 3 秒放结论",
        },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(q(container, "library-dump-notice")?.textContent).toContain("知识");
    // 复位:输入清空、卡片收起
    expect(q<HTMLTextAreaElement>(container, "library-dump-input")!.value).toBe("");
    expect(q(container, "knowledge-classify-card")).toBeNull();
  });

  it("归类失败 → 内联错误(非 toast),原始输入保留供重试 [gate-F2]", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "无可用 LLM 凭据" }),
    });
    const { container } = render(<LibraryDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "library-dump-input")!;
    fireEvent.change(input, { target: { value: "一段原文" } });
    fireEvent.click(q<HTMLButtonElement>(container, "library-dump-classify")!);

    await waitFor(() =>
      expect(q(container, "library-dump-error")).not.toBeNull(),
    );
    expect(q(container, "library-dump-error")!.textContent).toContain("无可用 LLM 凭据");
    expect(input.value).toBe("一段原文");
    expect(createKnowledge).not.toHaveBeenCalled();
  });
});

describe("LibraryDumpZone — 改道(library-dump-route-toggle)", () => {
  it("暂存的 .txt 改道「这是素材」→ 确认走上传链(不读文本)", async () => {
    const { container } = render(<LibraryDumpZone />);
    dropFiles(container, [new File(["内容"], "note.txt", { type: "text/plain" })]);
    const staged = q<HTMLLIElement>(container, "library-dump-staged-file")!;
    fireEvent.click(
      staged.querySelector<HTMLButtonElement>('[data-route-option="asset"]')!,
    );
    expect(
      q<HTMLLIElement>(container, "library-dump-staged-file")!.getAttribute(
        "data-route",
      ),
    ).toBe("asset");

    fireEvent.click(q<HTMLButtonElement>(container, "library-dump-stage-confirm")!);
    await waitFor(() => expect(completeUpload).toHaveBeenCalledTimes(1));
    expect(createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ fileName: "note.txt" }),
      }),
    );
    // 没读进输入区
    expect(q<HTMLTextAreaElement>(container, "library-dump-input")!.value).toBe("");
  });

  it("文本改道「这是素材」→ 「存为素材文件」把文本包成 .txt 走上传链", async () => {
    const { container } = render(<LibraryDumpZone />);
    fireEvent.change(q<HTMLTextAreaElement>(container, "library-dump-input")!, {
      target: { value: "口播逐字稿第一行\n第二行" },
    });
    // 文本分流切换出现在动作行
    const toggle = q<HTMLDivElement>(container, "library-dump-route-toggle")!;
    fireEvent.click(
      toggle.querySelector<HTMLButtonElement>('[data-route-option="asset"]')!,
    );
    fireEvent.click(q<HTMLButtonElement>(container, "library-dump-save-as-asset")!);

    await waitFor(() => expect(completeUpload).toHaveBeenCalledTimes(1));
    expect(createUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          assetType: "document",
          fileName: "口播逐字稿第一行.txt",
        }),
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(q(container, "library-dump-notice")?.textContent).toContain("素材");
    expect(createKnowledge).not.toHaveBeenCalled();
  });
});

describe("LibraryDumpZone — 记经验(Copilot 深链)", () => {
  it("「记经验」按钮常驻,深链带默认预填", () => {
    const { container } = render(<LibraryDumpZone />);
    const link = q<HTMLAnchorElement>(container, "library-dump-experience-link")!;
    expect(link.getAttribute("href")).toContain("copilot=open");
    expect(link.getAttribute("href")).toContain("surface=experience");
  });

  it("输入以「记一条经验」开头 → 主动作变成深链,带整段输入预填;不渲归类按钮", () => {
    const { container } = render(<LibraryDumpZone />);
    fireEvent.change(q<HTMLTextAreaElement>(container, "library-dump-input")!, {
      target: { value: "记一条经验:开头 3 秒必须给结论" },
    });
    const go = q<HTMLAnchorElement>(container, "library-dump-experience-go")!;
    const href = go.getAttribute("href")!;
    // 深链是 query-only href(?copilot=open&surface=…&prefill=…)
    const params = new URLSearchParams(href.slice(1));
    expect(params.get("surface")).toBe("experience");
    expect(params.get("prefill")).toBe("记一条经验:开头 3 秒必须给结论");
    expect(q(container, "library-dump-classify")).toBeNull();
  });
});
