/**
 * KnowledgeDumpZone 交互测试(T-062c 骨架 → T-079b 蒸馏门 → T-094 蒸馏入口 Copilot 化)。
 * 覆盖:
 *  - 「AI 蒸馏」= 深链打开 Copilot(surface=knowledge-distill + scope 隔离桶 + prefill):
 *    输入区有短原文 → prefill 带原文;为空/过长 → prefill 带引导话术;
 *  - 旧表单蒸馏流已移除:不再 POST /api/knowledge/distill、不再渲内联确认门
 *    (确认门抽到 knowledge-atom-gate,由 Copilot 蒸馏卡消费,另有单测);
 *  - 手动补录降级路径(type 下拉=四原子+reference,直接 knowledge.create);
 *  - 拖入 PDF/DOCX/Markdown/TXT → 直接复用文件导入真链;非支持格式内联提示。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const createKnowledge = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "k-1" }),
);
const createUpload = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({
    uploadId: "upload-1",
    assetId: "asset-1",
    uploadUrl: "mock://upload-1",
  }),
);
const completeUpload = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "asset-1" }),
);
const createAITask = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "task-1", status: "queued" }),
);
const getTask = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "task-1", status: "succeeded", errorMessage: null }),
);
const getAsset = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({
    id: "asset-1",
    extractStatus: "done",
    extractedText: "解析出的文档正文",
  }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: (input: unknown) => createKnowledge(input as never),
    createUpload: (input: unknown) => createUpload(input as never),
    completeUpload: (input: unknown) => completeUpload(input as never),
    createAITask: (input: unknown) => createAITask(input as never),
    getTask: (input: unknown) => getTask(input as never),
    getAsset: (input: unknown) => getAsset(input as never),
  },
}));

import {
  KnowledgeDumpZone,
  archiveTitleOf,
  distillCopilotHref,
  DISTILL_PREFILL_MAX_CHARS,
  DISTILL_GUIDE_PREFILL,
} from "./knowledge-dump-zone";

const fetchMock = vi.fn();

let localPush: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localPush=vi.spyOn(window.history,"pushState").mockImplementation(()=>{});
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  createKnowledge.mockClear();
  createUpload.mockClear();
  completeUpload.mockClear();
  createAITask.mockClear();
  getTask.mockClear();
  getAsset.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  localPush.mockRestore();
  cleanup();
  vi.unstubAllGlobals();
});

it("解析partial且无可用正文停止等待，原文件保留且不写知识库", async () => {
  vi.useFakeTimers();
  const { act } = await import("@testing-library/react");
  try {
    getAsset.mockResolvedValue({ id: "asset-1", extractStatus: "running", extractedText: null });
    getTask.mockResolvedValue({ id: "task-1", status: "partial" });
    fetchMock.mockResolvedValue({ ok: true });
    const { container } = render(<KnowledgeDumpZone/>);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(["PDF"], "部分资料.pdf", {type: "application/pdf"})] } });
    fireEvent.click(container.querySelector('[data-slot="knowledge-import-confirm"]')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(1200000); });
    expect(getTask).toHaveBeenCalledTimes(1);
    expect(createUpload).toHaveBeenCalledTimes(1); expect(createAITask).toHaveBeenCalledTimes(1);
    expect(createKnowledge).not.toHaveBeenCalled();
    const result = container.querySelector('[data-slot="knowledge-import-result-dialog"]');
    expect(result?.textContent).toContain("部分完成");
    expect(result?.textContent).toContain("原文件已保存在素材库，未加入知识库");
  } finally {
    getAsset.mockResolvedValue({ id: "asset-1", extractStatus: "done", extractedText: "解析出的文档正文" });
    getTask.mockResolvedValue({ id: "task-1", status: "succeeded", errorMessage: null });
    vi.useRealTimers();
  }
});

function q<T extends Element>(container: HTMLElement, slot: string): T | null {
  return container.querySelector<T>(`[data-slot="${slot}"]`);
}

describe("archiveTitleOf(原文存档标题;经 knowledge-atom-gate 再导出,兼容既有 import 面)", () => {
  it("取首个非空行,截 60 字", () => {
    expect(archiveTitleOf("\n\n  第一行标题  \n第二行")).toBe("第一行标题");
    expect(archiveTitleOf("长".repeat(80))).toHaveLength(60);
  });
});

describe("distillCopilotHref — 蒸馏 Copilot 深链(纯函数)", () => {
  it("短原文 → prefill 直接带原文;surface + scope 钉死 knowledge-distill 隔离桶", () => {
    const href = distillCopilotHref("  一段创作心得原文  ");
    const params = new URL(href,window.location.origin).searchParams;
    expect(params.get("copilot")).toBe("open");
    expect(params.get("surface")).toBe("knowledge-distill");
    expect(params.get("scope")).toBe("surface:knowledge-distill");
    expect(params.get("prefill")).toBe("一段创作心得原文");
  });

  it("输入为空 → prefill 带引导话术(把原文粘给我)", () => {
    const params = new URLSearchParams(distillCopilotHref("   ").slice(1));
    expect(params.get("prefill")).toBe(DISTILL_GUIDE_PREFILL);
  });

  it("原文过长(>上限)→ prefill 回落引导话术(URL 不塞全文)", () => {
    const long = "长".repeat(DISTILL_PREFILL_MAX_CHARS + 1);
    const params = new URLSearchParams(distillCopilotHref(long).slice(1));
    expect(params.get("prefill")).toBe(DISTILL_GUIDE_PREFILL);
  });
});

describe("KnowledgeDumpZone — 蒸馏入口 Copilot 化(T-094)", () => {
  it("点「AI 蒸馏」→ 本地打开深链(带输入区原文 prefill),不再 POST 旧蒸馏路由、不渲内联确认门", () => {
    const { container } = render(<KnowledgeDumpZone />);
    fireEvent.change(q<HTMLTextAreaElement>(container, "knowledge-dump-input")!, {
      target: { value: "一段创作心得原文" },
    });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill")!);

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(localPush).toHaveBeenCalledTimes(1);
    const href = localPush.mock.calls[0]![2] as string;
    const params = new URL(href,window.location.origin).searchParams;
    expect(params.get("copilot")).toBe("open");
    expect(params.get("surface")).toBe("knowledge-distill");
    expect(params.get("scope")).toBe("surface:knowledge-distill");
    expect(params.get("prefill")).toBe("一段创作心得原文");
    // 旧管线彻底不走:无 fetch、无确认门、无写库
    expect(fetchMock).not.toHaveBeenCalled();
    expect(q(container, "knowledge-distill-batch")).toBeNull();
    expect(createKnowledge).not.toHaveBeenCalled();
  });

  it("输入区为空也可点(引导话术开聊)—— 蒸馏入口不再依赖表单内容", () => {
    const { container } = render(<KnowledgeDumpZone />);
    const btn = q<HTMLButtonElement>(container, "knowledge-distill")!;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    const href = localPush.mock.calls[0]![2] as string;
    expect(new URL(href,window.location.origin).searchParams.get("prefill")).toBe(
      DISTILL_GUIDE_PREFILL,
    );
  });
});

describe("KnowledgeDumpZone — 手动补录降级路径", () => {
  it("手动补录:title+type+正文直接 knowledge.create(不经 AI);type 下拉=四原子+reference", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    fireEvent.change(q<HTMLTextAreaElement>(container, "knowledge-dump-input")!, {
      target: { value: "手动的正文" },
    });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-manual-entry")!);

    const typeSelect = q<HTMLSelectElement>(container, "knowledge-manual-type")!;
    const optionValues = Array.from(typeSelect.options).map((o) => o.value);
    expect(optionValues).toEqual(["claim", "evidence", "quote", "qa", "reference"]);

    const form = q<HTMLFormElement>(container, "knowledge-manual-form")!;
    fireEvent.change(q<HTMLInputElement>(container, "knowledge-manual-title")!, {
      target: { value: "手动标题" },
    });
    fireEvent.change(typeSelect, { target: { value: "evidence" } });
    fireEvent.submit(form);

    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1));
    expect(createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          title: "手动标题",
          knowledgeType: "evidence",
          content: "手动的正文",
        },
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled(); // 不经 AI 蒸馏
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });

  it("手动补录失败 → 内联错误,输入保留 [gate-F2]", async () => {
    createKnowledge.mockRejectedValueOnce(new Error("后端连接失败"));
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    fireEvent.change(input, { target: { value: "保留的正文" } });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-manual-entry")!);
    fireEvent.change(q<HTMLInputElement>(container, "knowledge-manual-title")!, {
      target: { value: "标题" },
    });
    fireEvent.submit(q<HTMLFormElement>(container, "knowledge-manual-form")!);

    await waitFor(() =>
      expect(q(container, "knowledge-dump-error")).not.toBeNull(),
    );
    // [T-133] 人话收口:「后端连接失败」是干净中文短句(策展人话)→ 透传;输入仍保留。
    expect(q(container, "knowledge-dump-error")!.textContent).toContain(
      "后端连接失败",
    );
    expect(input.value).toBe("保留的正文");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});

describe("KnowledgeDumpZone — 拖入文件直接导入", () => {
  it("拖入 .txt → 直接上传并写入知识库，不再只填入输入框", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    const file = new File(["文件里的内容"], "note.txt", { type: "text/plain" });
    fireEvent.drop(input, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1));
    expect(createUpload).toHaveBeenCalledTimes(1);
    expect(createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "note.txt",
          content: "文件里的内容",
        }),
      }),
    );
    expect(input.value).toBe("");
  });

  it("拖入不支持的文件 → 内联提示,不静默吞", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    const file = new File([new Uint8Array([1, 2])], "photo.png", {
      type: "image/png",
    });
    fireEvent.drop(input, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() =>
      expect(q(container, "knowledge-dump-error")).not.toBeNull(),
    );
    expect(q(container, "knowledge-dump-error")!.textContent).toContain("PDF");
  });
});

describe("KnowledgeDumpZone — 文件导入闭环(T-547)", () => {
  it("选择文件后先弹确认层；取消不会上传或写知识库", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLInputElement>(container, "knowledge-file-input")!;
    const file = new File(["# 正文"], "note.md", { type: "text/markdown" });

    fireEvent.change(input, { target: { files: [file] } });

    expect(q(container, "knowledge-import-confirm-dialog")).not.toBeNull();
    expect(q(container, "knowledge-import-confirm-dialog")!.textContent).toContain(
      "note.md",
    );
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-import-cancel")!);
    expect(q(container, "knowledge-import-confirm-dialog")).toBeNull();
    expect(createUpload).not.toHaveBeenCalled();
    expect(createKnowledge).not.toHaveBeenCalled();
  });

  it("Markdown 导入把真实正文写入 revision，并明确回显逐批结果", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLInputElement>(container, "knowledge-file-input")!;
    const file = new File(["# 标题\n\n真实正文"], "note.md", {
      type: "text/markdown",
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-import-confirm")!);

    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1));
    expect(createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "note.md",
          content: "# 标题\n\n真实正文",
          assetId: "asset-1",
        }),
      }),
    );
    expect(createAITask).not.toHaveBeenCalled();
    await waitFor(() => {
      const result = q(container, "knowledge-import-result-dialog");
      expect(result).not.toBeNull();
      expect(result!.textContent).toContain("成功 1 个");
      expect(result!.textContent).toContain("失败 0 个");
    });
    expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
  });

  it("PDF 先走确定性抽取，只有读到非空正文后才创建知识条目", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLInputElement>(container, "knowledge-file-input")!;
    const file = new File([new Uint8Array([1, 2, 3])], "report.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-import-confirm")!);

    await waitFor(() => expect(createAITask).toHaveBeenCalledTimes(1));
    expect(createAITask).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          taskType: "material.extract",
          inputData: { assetId: "asset-1", fileName: "report.pdf" },
        }),
      }),
    );
    await waitFor(() =>
      expect(createKnowledge).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            title: "report.pdf",
            content: "解析出的文档正文",
          }),
        }),
      ),
    );
  });

  it("正文解析失败时不创建空知识，只回显真实失败和素材保留事实", async () => {
    getAsset.mockResolvedValueOnce({
      id: "asset-1",
      extractStatus: "failed",
      extractedText: null,
    });
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLInputElement>(container, "knowledge-file-input")!;
    const file = new File([new Uint8Array([1, 2, 3])], "scan.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-import-confirm")!);

    await waitFor(() => {
      const result = q(container, "knowledge-import-result-dialog");
      expect(result).not.toBeNull();
      expect(result!.textContent).toContain("失败 1 个");
      expect(result!.textContent).toContain("未加入知识库");
    });
    expect(createKnowledge).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});

it("T-1066 两分钟观察结束保留文件与任务，继续查询不重复上传和解析", async () => {
  vi.useFakeTimers();
  const { act, screen } = await import("@testing-library/react");
  try {
    getAsset.mockResolvedValue({ id: "asset-slow", extractStatus: "running", extractedText: null });
    getTask.mockResolvedValue({ id: "task-1", status: "running" });
    const { container } = render(<KnowledgeDumpZone />);
    const file = new File(["slow PDF"], "慢解析.pdf", { type: "application/pdf" });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /确认导入|开始导入/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(screen.getByRole("button", { name: "继续查询原任务" })).toBeTruthy();
    expect(container.textContent).not.toContain("正文解析超时");
    expect(createAITask).toHaveBeenCalledTimes(1);
    expect(createUpload).toHaveBeenCalledTimes(1);
    getAsset.mockResolvedValue({ id: "asset-slow", extractStatus: "done", extractedText: "迟到正文" });
    fireEvent.click(screen.getByRole("button", { name: "继续查询原任务" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(createKnowledge).toHaveBeenCalledWith(expect.objectContaining({ body: expect.objectContaining({ content: "迟到正文" }) }));
    expect(createAITask).toHaveBeenCalledTimes(1);
    expect(createUpload).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});
