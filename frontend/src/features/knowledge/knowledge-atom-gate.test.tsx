/**
 * KnowledgeAtomGate 单测(T-094,自 knowledge-dump-zone 旧内联确认门抽出)。
 * mock contract client,覆盖:
 *  - 默认全选,采纳按钮显条数;改 type/title/sourceNote 后逐条 knowledge.create
 *    (content=note,带 sourceNote)+ suggestedTags 挂 tag + 原文 reference 存档 + refresh;
 *  - 取消勾选做减法(未选中的不落库);
 *  - 关掉「原文同时存档」→ 不存 reference;originalText 为空 → 不渲存档项;
 *  - 采纳失败 → 内联错误,候选保留(不静默吞)[gate-F2];
 *  - 采纳成功 → 收尾态(已采纳 N 条)。
 */

import type * as React from "react";
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

import {
  KnowledgeAtomGate,
  archiveTitleOf,
  type DistilledAtom,
} from "./knowledge-atom-gate";

const SAMPLE_ATOMS: DistilledAtom[] = [
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

beforeEach(() => {
  knowledgeSeq = 0;
  mockRouter.refresh.mockClear();
  createKnowledge.mockClear();
  listTags.mockClear();
  createTag.mockClear();
  assignTags.mockClear();
});

afterEach(() => cleanup());

function q<T extends Element>(container: HTMLElement, slot: string): T | null {
  return container.querySelector<T>(`[data-slot="${slot}"]`);
}
function qa<T extends Element>(container: HTMLElement, slot: string): T[] {
  return Array.from(container.querySelectorAll<T>(`[data-slot="${slot}"]`));
}

function renderGate(
  over: Partial<React.ComponentProps<typeof KnowledgeAtomGate>> = {},
) {
  return render(
    <KnowledgeAtomGate
      atoms={SAMPLE_ATOMS}
      suggestedTags={["上下文工程", "Agent"]}
      originalText={"第一行是标题\n后面是全文正文"}
      {...over}
    />,
  );
}

describe("archiveTitleOf(原文存档标题)", () => {
  it("取首个非空行,截 60 字", () => {
    expect(archiveTitleOf("\n\n  第一行标题  \n第二行")).toBe("第一行标题");
    expect(archiveTitleOf("长".repeat(80))).toHaveLength(60);
  });
});

describe("KnowledgeAtomGate — 蒸馏批量确认门(共享组件)", () => {
  it("默认全选,原文存档默认勾选,采纳按钮显示条数", () => {
    const { container } = renderGate();
    const checks = qa<HTMLInputElement>(container, "knowledge-atom-select");
    expect(checks).toHaveLength(3);
    expect(checks.every((c) => c.checked)).toBe(true);
    expect(
      q<HTMLInputElement>(container, "knowledge-distill-archive")!.checked,
    ).toBe(true);
    expect(
      q<HTMLButtonElement>(container, "knowledge-distill-adopt")!.textContent,
    ).toContain("采纳选中 3 条");
  });

  it("改 type/title/sourceNote → 采纳 → 逐条 knowledge.create + 原文存档 + tag 挂载 + refresh + 收尾态", async () => {
    const { container } = renderGate();

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
    const third = (
      createKnowledge.mock.calls[2]![0] as { body: Record<string, unknown> }
    ).body;
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
    // suggestedTags 挂载:缺的标签 createTag,再 assignTags 到每条原子
    await waitFor(() => expect(assignTags).toHaveBeenCalledTimes(3));
    expect(createTag).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ name: "上下文工程" }),
      }),
    );
    expect(assignTags).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          entityType: "knowledge",
          entityId: "k-1",
        }),
      }),
    );
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    // 采纳后收尾态(候选行收起,显已采纳条数)
    await waitFor(() =>
      expect(q(container, "knowledge-atom-gate-done")).not.toBeNull(),
    );
    expect(q(container, "knowledge-atom-gate-done")!.textContent).toContain(
      "已采纳 3 条",
    );
    expect(q(container, "knowledge-distill-batch")).toBeNull();
  });

  it("取消勾选做减法:未选中的不落库,按钮条数跟着变", async () => {
    const { container } = renderGate();
    const checks = qa<HTMLInputElement>(container, "knowledge-atom-select");
    fireEvent.click(checks[1]!);
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
    const { container } = renderGate();
    fireEvent.click(q<HTMLInputElement>(container, "knowledge-distill-archive")!);
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill-adopt")!);
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(3));
    const savedTypes = createKnowledge.mock.calls.map(
      (c) => (c[0] as { body: { knowledgeType: string } }).body.knowledgeType,
    );
    expect(savedTypes).not.toContain("reference");
  });

  it("originalText 为空 → 不渲「原文存档」项,也不多存 reference", async () => {
    const { container } = renderGate({ originalText: "" });
    expect(q(container, "knowledge-distill-archive")).toBeNull();
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill-adopt")!);
    await waitFor(() => expect(createKnowledge).toHaveBeenCalledTimes(3));
  });

  it("采纳失败 → 内联错误,候选保留(不静默吞)[gate-F2]", async () => {
    createKnowledge.mockRejectedValueOnce(new Error("后端连接失败"));
    const { container } = renderGate();
    fireEvent.click(q<HTMLButtonElement>(container, "knowledge-distill-adopt")!);
    await waitFor(() =>
      expect(q(container, "knowledge-atom-gate-error")).not.toBeNull(),
    );
    expect(q(container, "knowledge-atom-gate-error")!.textContent).toContain(
      "后端连接失败",
    );
    // 确认门保留,可重试;refresh 未发生
    expect(q(container, "knowledge-distill-batch")).not.toBeNull();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
  });
});
