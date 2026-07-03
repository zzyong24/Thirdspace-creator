/**
 * KnowledgeDumpZone 交互测试(T-062c 骨架 → T-079b 蒸馏批量确认门)。mock 蒸馏调用
 * (fetch /api/knowledge/distill)与 contract client,覆盖:
 *  - 蒸馏成功 → 批量确认门(默认全选;type/title/sourceNote 可改)→ 采纳选中 N 条 →
 *    逐条 knowledge.create(content=note,带 sourceNote)+ suggestedTags 挂 tag + refresh;
 *  - 「原文同时存档」默认勾选 → 多存一条 reference(title=首行≤60,content=全文);关掉则不存;
 *  - 取消勾选做减法(采纳条数跟着变,未选中的不落库);
 *  - 蒸馏失败 → 内联错误(非 toast),原始输入保留 [gate-F2];
 *  - 手动补录次入口(type 下拉=四原子+reference);
 *  - 拖入 .txt 文本文件 → FileReader 读入输入区。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

let knowledgeSeq = 0;
const createKnowledge = vi.fn((_input: unknown): Promise<unknown> => {
  knowledgeSeq += 1;
  return Promise.resolve({ id: `k-${knowledgeSeq}` });
});
const listTags = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve([{ id: "tag-1", name: "已有标签" }]),
);
const createTag = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "tag-new" }),
);
const assignTags = vi.fn((_input: unknown): Promise<unknown> => Promise.resolve([]));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: (input: unknown) => createKnowledge(input as never),
    listTags: (input: unknown) => listTags(input as never),
    createTag: (input: unknown) => createTag(input as never),
    assignTags: (input: unknown) => assignTags(input as never),
  },
}));

import { KnowledgeDumpZone, archiveTitleOf } from "./knowledge-dump-zone";

const fetchMock = vi.fn();

beforeEach(() => {
  knowledgeSeq = 0;
  mockRouter.refresh.mockClear();
  createKnowledge.mockClear();
  listTags.mockClear();
  createTag.mockClear();
  assignTags.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SAMPLE_ATOMS = [
  {
    type: "claim",
    title: "上下文工程比提示词工程重要",
    note: "谈 Agent 设计时的主张",
    sourceNote: "",
  },
  {
    type: "quote",
    title: "把模型当同事,不当算命先生",
    note: "",
    sourceNote: "原文作者原话",
  },
  { type: "evidence", title: "截断 8000 字符后准确率不降", note: "", sourceNote: "" },
];

function distillOk(
  atoms: ReadonlyArray<Record<string, unknown>> = SAMPLE_ATOMS,
  suggestedTags: string[] = ["上下文工程", "Agent"],
) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ atoms, suggestedTags }),
  });
}

function q<T extends Element>(container: HTMLElement, slot: string): T | null {
  return container.querySelector<T>(`[data-slot="${slot}"]`);
}
function qa<T extends Element>(container: HTMLElement, slot: string): T[] {
  return Array.from(container.querySelectorAll<T>(`[data-slot="${slot}"]`));
}

/** 倒文本 + 点蒸馏 + 等确认门出现。 */
async function distillInto(container: HTMLElement, text = "一段创作心得原文") {
  fireEvent.change(q<HTMLTextAreaElement>(container, "knowledge-dump-input")!, {
    target: { value: text },
  });
  fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill")!);
  await waitFor(() =>
    expect(q(container, "knowledge-distill-batch")).not.toBeNull(),
  );
}

describe("archiveTitleOf(原文存档标题)", () => {
  it("取首个非空行,截 60 字", () => {
    expect(archiveTitleOf("\n\n  第一行标题  \n第二行")).toBe("第一行标题");
    expect(archiveTitleOf("长".repeat(80))).toHaveLength(60);
  });
});

describe("KnowledgeDumpZone — 蒸馏批量确认门", () => {
  it("倒入文本 → 蒸馏 → 确认门默认全选,采纳按钮显示条数", async () => {
    distillOk();
    const { container } = render(<KnowledgeDumpZone />);
    await distillInto(container);

    // 触发路径:POST /api/knowledge/distill(轻路由,非 contract op)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/knowledge/distill",
      expect.objectContaining({ method: "POST" }),
    );
    // 3 行原子,checkbox 默认全选
    const checks = qa<HTMLInputElement>(container, "knowledge-atom-select");
    expect(checks).toHaveLength(3);
    expect(checks.every((c) => c.checked)).toBe(true);
    // 原文存档默认勾选
    expect(
      q<HTMLInputElement>(container, "knowledge-distill-archive")!.checked,
    ).toBe(true);
    expect(
      q<HTMLButtonElement>(container, "knowledge-distill-adopt")!.textContent,
    ).toContain("采纳选中 3 条");
  });

  it("改 type/title/sourceNote → 采纳 → 逐条 knowledge.create(content=note,带 sourceNote)+ 原文存档 + tag 挂载 + refresh", async () => {
    distillOk();
    const { container } = render(<KnowledgeDumpZone />);
    await distillInto(container, "第一行是标题\n后面是全文正文");

    // 第 1 条:type 改成 quote,title 改写,补出处(确认门可改)
    const types = qa<HTMLSelectElement>(container, "knowledge-atom-type");
    fireEvent.change(types[0]!, { target: { value: "quote" } });
    const titles = qa<HTMLInputElement>(container, "knowledge-atom-title");
    fireEvent.change(titles[0]!, { target: { value: "改过的原子标题" } });
    const sources = qa<HTMLInputElement>(container, "knowledge-atom-source");
    fireEvent.change(sources[0]!, { target: { value: "手补的出处" } });

    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill-adopt")!);
    // 3 原子 + 1 原文存档 = 4 次 create
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(4));
    expect(createKnowledge).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: {
          title: "改过的原子标题",
          knowledgeType: "quote",
          content: "谈 Agent 设计时的主张",
          sourceNote: "手补的出处",
        },
      }),
    );
    // 第 2 条:sourceNote 来自蒸馏结果透传
    expect(createKnowledge).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: expect.objectContaining({
          knowledgeType: "quote",
          sourceNote: "原文作者原话",
        }),
      }),
    );
    // 第 3 条:无 sourceNote → body 不带该键(缺省落 NULL)
    const third = (createKnowledge.mock.calls[2]![0] as { body: Record<string, unknown> })
      .body;
    expect(third).not.toHaveProperty("sourceNote");
    // 原文存档:reference,title=首行,content=全文
    expect(createKnowledge).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        body: {
          title: "第一行是标题",
          knowledgeType: "reference",
          content: "第一行是标题\n后面是全文正文",
        },
      }),
    );
    // suggestedTags 挂载:缺的标签 createTag,再 assignTags 到每条原子(entityType=knowledge)
    await waitFor(() => expect(assignTags).toHaveBeenCalledTimes(3));
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ name: "上下文工程" }),
      }),
    );
    expect(assignTags).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ entityType: "knowledge", entityId: "k-1" }),
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    // 采纳后复位(输入清空,确认门收起)
    expect(q<HTMLTextAreaElement>(container, "knowledge-dump-input")!.value).toBe("");
    expect(q(container, "knowledge-distill-batch")).toBeNull();
  });

  it("取消勾选做减法:未选中的不落库,按钮条数跟着变", async () => {
    distillOk();
    const { container } = render(<KnowledgeDumpZone />);
    await distillInto(container);

    const checks = qa<HTMLInputElement>(container, "knowledge-atom-select");
    fireEvent.click(checks[1]!); // 取消第 2 条
    expect(
      q<HTMLButtonElement>(container, "knowledge-distill-adopt")!.textContent,
    ).toContain("采纳选中 2 条");

    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill-adopt")!);
    // 2 原子 + 1 存档 = 3 次;被取消的 quote 标题不出现
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(3));
    const savedTitles = createKnowledge.mock.calls.map(
      (c) => (c[0] as { body: { title: string } }).body.title,
    );
    expect(savedTitles).not.toContain("把模型当同事,不当算命先生");
  });

  it("关掉「原文同时存档」→ 只存原子,不存 reference", async () => {
    distillOk();
    const { container } = render(<KnowledgeDumpZone />);
    await distillInto(container);

    fireEvent.click(q<HTMLInputElement>(container, "knowledge-distill-archive")!);
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill-adopt")!);
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(3));
    const savedTypes = createKnowledge.mock.calls.map(
      (c) => (c[0] as { body: { knowledgeType: string } }).body.knowledgeType,
    );
    expect(savedTypes).not.toContain("reference");
  });

  it("蒸馏失败 → 内联错误(非 toast),原始输入保留供重试 [gate-F2]", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "无可用 LLM 凭据" }),
    });
    const { container } = render(<KnowledgeDumpZone />);
    const input = q<HTMLTextAreaElement>(container, "knowledge-dump-input")!;
    fireEvent.change(input, { target: { value: "一段原文" } });
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill")!);

    await waitFor(() =>
      expect(q(container, "knowledge-dump-error")).not.toBeNull(),
    );
    expect(q(container, "knowledge-dump-error")!.textContent).toContain(
      "无可用 LLM 凭据",
    );
    // 输入保留,无确认门,未写库
    expect(input.value).toBe("一段原文");
    expect(q(container, "knowledge-distill-batch")).toBeNull();
    expect(createKnowledge).not.toHaveBeenCalled();
  });

  it("采纳失败 → 内联错误,确认门与输入保留(不静默吞)", async () => {
    distillOk();
    createKnowledge.mockRejectedValueOnce(new Error("后端连接失败"));
    const { container } = render(<KnowledgeDumpZone />);
    await distillInto(container, "保留的原文");

    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill-adopt")!);
    await waitFor(() =>
      expect(q(container, "knowledge-dump-error")).not.toBeNull(),
    );
    expect(q(container, "knowledge-dump-error")!.textContent).toContain(
      "后端连接失败",
    );
    expect(q(container, "knowledge-distill-batch")).not.toBeNull();
    expect(
      q<HTMLTextAreaElement>(container, "knowledge-dump-input")!.value,
    ).toBe("保留的原文");
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });

  it("空输入时「蒸馏」禁用(不空跑)", () => {
    const { container } = render(<KnowledgeDumpZone />);
    expect(
      q<HTMLButtonElement>(container, "knowledge-distill")!.disabled,
    ).toBe(true);
  });
});

describe("KnowledgeDumpZone — 手动补录次入口", () => {
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
