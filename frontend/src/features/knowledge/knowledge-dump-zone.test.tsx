/**
 * KnowledgeDumpZone 交互测试(T-062c 骨架 → T-079b 蒸馏门 → T-094 蒸馏入口 Copilot 化)。
 * 覆盖:
 *  - 「AI 蒸馏」= 深链打开 Copilot(surface=knowledge-distill + scope 隔离桶 + prefill):
 *    输入区有短原文 → prefill 带原文;为空/过长 → prefill 带引导话术;
 *  - 旧表单蒸馏流已移除:不再 POST /api/knowledge/distill、不再渲内联确认门
 *    (确认门抽到 knowledge-atom-gate,由 Copilot 蒸馏卡消费,另有单测);
 *  - 手动补录降级路径(type 下拉=四原子+reference,直接 knowledge.create);
 *  - 拖入 .md/.txt 文本文件 → FileReader 读入输入区;非文本内联提示。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const createKnowledge = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "k-1" }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: (input: unknown) => createKnowledge(input as never),
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

beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockRouter.push.mockClear();
  createKnowledge.mockClear();
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

describe("archiveTitleOf(原文存档标题;经 knowledge-atom-gate 再导出,兼容既有 import 面)", () => {
  it("取首个非空行,截 60 字", () => {
    expect(archiveTitleOf("\n\n  第一行标题  \n第二行")).toBe("第一行标题");
    expect(archiveTitleOf("长".repeat(80))).toHaveLength(60);
  });
});

describe("distillCopilotHref — 蒸馏 Copilot 深链(纯函数)", () => {
  it("短原文 → prefill 直接带原文;surface + scope 钉死 knowledge-distill 隔离桶", () => {
    const href = distillCopilotHref("  一段创作心得原文  ");
    const params = new URLSearchParams(href.slice(1));
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
  it("点「AI 蒸馏」→ router.push 深链(带输入区原文 prefill),不再 POST 旧蒸馏路由、不渲内联确认门", () => {
    const { container } = render(<KnowledgeDumpZone />);
    fireEvent.change(q<HTMLTextAreaElement>(container, "knowledge-dump-input")!, {
      target: { value: "一段创作心得原文" },
    });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill")!);

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    const href = mockRouter.push.mock.calls[0]![0] as string;
    const params = new URLSearchParams(href.slice(1));
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
    const href = mockRouter.push.mock.calls[0]![0] as string;
    expect(new URLSearchParams(href.slice(1)).get("prefill")).toBe(
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
    expect(q(container, "knowledge-dump-error")!.textContent).toContain(
      "后端连接失败",
    );
    expect(input.value).toBe("保留的正文");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
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
