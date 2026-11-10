/**
 * 批次2-1（月明 2026-11-10）：对话蒸馏结果默认全部采纳、逐条可撤销，不再要人逐条/整批点确认。
 * 采纳仍走服务端「按来源幂等」的 adoptKnowledgeDistill：已有回执（刷新/重放）绝不再次写入。
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));
const getReceipt = vi.fn();
const adopt = vi.fn();
const archive = vi.fn();
vi.mock("@/lib/contract-client", () => ({
  client: {
    getKnowledgeDistillReceipt: (input: unknown) => getReceipt(input),
    adoptKnowledgeDistill: (input: unknown) => adopt(input),
    archiveKnowledge: (input: unknown) => archive(input),
  },
}));

import { KnowledgeAtomGate } from "./knowledge-atom-gate";

const source = { conversationId: "conv-1", sourceMessageId: "msg-1", toolCallId: "call-1" };
const atoms = [
  { type: "claim" as const, title: "观点一", note: "", sourceNote: "" },
  { type: "quote" as const, title: "金句一", note: "", sourceNote: "作者" },
];
const receipt = { source, taskId: "task-1", callId: "call-1", knowledgeIds: ["k-1", "k-2"], atomCount: 2, archiveKnowledgeId: null, createdAt: "2026-11-10T00:00:00.000Z" };

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  getReceipt.mockReset(); adopt.mockReset(); archive.mockReset();
  archive.mockResolvedValue({ id: "k-1" });
});

describe("KnowledgeAtomGate 默认采纳", () => {
  it("无回执时自动采纳全部原子一次，并可逐条撤销（撤销=归档该条）", async () => {
    getReceipt.mockResolvedValue({ receipt: null });
    adopt.mockResolvedValue(receipt);
    render(<KnowledgeAtomGate autoAdopt source={source} atoms={atoms} suggestedTags={[]} originalText="原文" />);
    await screen.findByText(/已自动采纳 2 条进知识库/);
    expect(adopt).toHaveBeenCalledTimes(1);
    expect((adopt.mock.calls[0]![0] as { body: { atoms: unknown[] } }).body.atoms).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "撤销「观点一」" }));
    await waitFor(() => expect(archive).toHaveBeenCalledWith({ params: { knowledgeId: "k-1" }, query: undefined, body: undefined }));
    expect(await screen.findByText("已撤销")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销「金句一」" })).toBeEnabled();
  });

  it("已有回执（刷新/重放）不再写入，直接显示已采纳且仍可撤销", async () => {
    getReceipt.mockResolvedValue({ receipt });
    render(<KnowledgeAtomGate autoAdopt source={source} atoms={atoms} suggestedTags={[]} originalText="原文" />);
    await screen.findByText(/已采纳 2 条进知识库/);
    expect(adopt).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "撤销「金句一」" })).toBeInTheDocument();
  });
});
