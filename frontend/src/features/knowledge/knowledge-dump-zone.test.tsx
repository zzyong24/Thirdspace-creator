/**
 * KnowledgeDumpZone 交互测试(T-062c)。mock 分类调用(fetch /api/knowledge/classify)与
 * contract client,覆盖:
 *  - 归类成功 → 确认门卡片(type/title 可改)→ 存入知识库 → knowledge.create + refresh;
 *  - 归类失败 → 内联错误(非 toast),原始输入保留 [gate-F2];
 *  - 手动补录次入口(title+type+正文直接存,旧「新建知识」表单的退役承接);
 *  - 拖入 .txt 文本文件 → FileReader 读入输入区。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const createKnowledge = vi.fn((input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "k-new", input }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: (input: unknown) => createKnowledge(input),
  },
}));

import { KnowledgeDumpZone } from "./knowledge-dump-zone";

const fetchMock = vi.fn();

beforeEach(() => {
  mockRouter.refresh.mockClear();
  createKnowledge.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function classifyOk(classification: Record<string, unknown>) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ classification }),
  });
}

function q<T extends Element>(container: HTMLElement, slot: string): T | null {
  return container.querySelector<T>(`[data-slot="${slot}"]`);
}

describe("KnowledgeDumpZone — 归类确认门", () => {
  it("倒入文本 → 归类 → 确认卡(type/title 可改)→ 存入知识库 → knowledge.create + refresh", async () => {
    classifyOk({
      knowledgeType: "snippet",
      title: "Hook 模板",
      tags: ["Hook", "开头"],
      summary: "一句可复用的开头钩子。",
    });
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    fireEvent.change(input, { target: { value: "前 3 秒放结论" } });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-classify")!);

    await waitFor(() =>
      expect(q(container, "knowledge-classify-card")).not.toBeNull(),
    );
    // 触发路径:POST /api/knowledge/classify(轻路由,非 contract op)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/knowledge/classify",
      expect.objectContaining({ method: "POST" }),
    );
    // AI 判的候选已预填,type/title 可改(确认门)
    const title = q<HTMLInputElement>(container, "knowledge-classify-title")!;
    expect(title.value).toBe("Hook 模板");
    fireEvent.change(title, { target: { value: "改过的标题" } });
    const type = q<HTMLSelectElement>(container, "knowledge-classify-type")!;
    fireEvent.change(type, { target: { value: "note" } });

    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-classify-save")!);
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1));
    expect(createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          title: "改过的标题",
          knowledgeType: "note",
          content: "前 3 秒放结论",
        },
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    // 存入后复位(输入清空,卡片收起)
    expect(q<HTMLTextAreaElement>(container, "knowledge-dump-input")!.value).toBe("");
    expect(q(container, "knowledge-classify-card")).toBeNull();
  });

  it("归类失败 → 内联错误(非 toast),原始输入保留供重试 [gate-F2]", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "无可用 LLM 凭据" }),
    });
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    fireEvent.change(input, { target: { value: "一段原文" } });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-classify")!);

    await waitFor(() =>
      expect(q(container, "knowledge-dump-error")).not.toBeNull(),
    );
    expect(q(container, "knowledge-dump-error")!.textContent).toContain(
      "无可用 LLM 凭据",
    );
    // 输入保留,无卡片,未写库
    expect(input.value).toBe("一段原文");
    expect(q(container, "knowledge-classify-card")).toBeNull();
    expect(createKnowledge).not.toHaveBeenCalled();
  });

  it("空输入时「归类」禁用(不空跑)", () => {
    const { container } = render(<KnowledgeDumpZone />);
    expect(
      q<HTMLButtonElement>(container, "knowledge-classify")!.disabled,
    ).toBe(true);
  });
});

describe("KnowledgeDumpZone — 手动补录次入口", () => {
  it("手动补录:title+type+正文直接 knowledge.create(不经 AI)", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    fireEvent.change(q<HTMLTextAreaElement>(container, "knowledge-dump-input")!, {
      target: { value: "手动的正文" },
    });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-manual-entry")!);

    const form = q<HTMLFormElement>(container, "knowledge-manual-form")!;
    fireEvent.change(q<HTMLInputElement>(container, "knowledge-manual-title")!, {
      target: { value: "手动标题" },
    });
    fireEvent.change(q<HTMLSelectElement>(container, "knowledge-manual-type")!, {
      target: { value: "reference" },
    });
    fireEvent.submit(form);

    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(1));
    expect(createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          title: "手动标题",
          knowledgeType: "reference",
          content: "手动的正文",
        },
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled(); // 不经 AI 归类
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
  });
});

describe("KnowledgeDumpZone — 拖入文本文件", () => {
  it("拖入 .txt → FileReader 读文本进输入区", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    const file = new File(["文件里的内容"], "note.txt", { type: "text/plain" });
    fireEvent.drop(input, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() => expect(input.value).toContain("文件里的内容"));
  });

  it("拖入非文本文件 → 内联提示,不静默吞", async () => {
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    const file = new File([new Uint8Array([1, 2])], "photo.png", {
      type: "image/png",
    });
    fireEvent.drop(input, { dataTransfer: { files: [file], types: ["Files"] } });
    await waitFor(() =>
      expect(q(container, "knowledge-dump-error")).not.toBeNull(),
    );
    expect(q(container, "knowledge-dump-error")!.textContent).toContain(".md / .txt");
  });
});
