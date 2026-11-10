/** 批次2-3：空稿面自动起草 + 自动写入；与 B6 未保存守卫兼容。 */
import * as React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }) }));
const getTask = vi.fn(), listTaskResults = vi.fn(), confirmTask = vi.fn(), createOutput = vi.fn();
vi.mock("@/lib/contract-client", () => ({ client: {
  getTask: (...a: unknown[]) => getTask(...a), listTaskResults: (...a: unknown[]) => listTaskResults(...a),
  confirmTask: (...a: unknown[]) => confirmTask(...a), createOutput: (...a: unknown[]) => createOutput(...a),
} }));
const openChat = vi.fn();
vi.mock("./draft-chat-request", async (orig) => ({ ...(await orig<typeof import("./draft-chat-request")>()), useDraftChatRequest: () => ({ openChat }) }));
import { AutoFirstDraft } from "./auto-first-draft";
import { markAutoFirstDraft, resetAutoFirstDraftForTest } from "./auto-first-draft-signal";
import { ChatScriptDraftCard } from "@/features/copilot/chat-script-draft-card";
import { beginForegroundActivity, resetForegroundActivitiesForTest } from "@/lib/foreground-activity";

beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks(); resetAutoFirstDraftForTest(); resetForegroundActivitiesForTest();
  getTask.mockResolvedValue({ status: "awaiting_confirmation" });
  listTaskResults.mockResolvedValue([{ resultData: { body: "x", validationStatus: "valid", validationErrors: [], canAdopt: true, contentData: { sections: [{ heading: "开场", body: "口播" }] } } }]);
  confirmTask.mockResolvedValue({ id: "t", status: "succeeded" });
});
afterEach(cleanup);

it("空稿面进入：自动发起一次整稿起草（带项目选区），同一项目再进不重复", async () => {
  const first = render(<AutoFirstDraft enabled projectId="p1" projectTitle="题目" outputId="o1" />);
  await waitFor(() => expect(openChat).toHaveBeenCalledTimes(1));
  expect(openChat.mock.calls[0]![0]).toMatchObject({ functionKey: "script.draft", autoSend: true, selection: { kind: "content_output", id: "o1" } });
  first.unmount();
  render(<AutoFirstDraft enabled projectId="p1" projectTitle="题目" outputId="o1" />);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(openChat).toHaveBeenCalledTimes(1);
});

it("稿面已有版本或有未保存修改时不自动起草", async () => {
  render(<AutoFirstDraft enabled={false} projectId="p2" projectTitle="t" outputId="o" />);
  const end = beginForegroundActivity("脚本有未保存的修改");
  render(<AutoFirstDraft enabled projectId="p3" projectTitle="t" outputId="o" />);
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(openChat).not.toHaveBeenCalled(); end();
});

it("自动起草的整稿候选可采纳时自动写入稿面（confirmTask 一次）", async () => {
  markAutoFirstDraft("p4");
  render(<ChatScriptDraftCard taskId="task-auto" projectId="p4" error={null} pollIntervalMs={0} />);
  await waitFor(() => expect(confirmTask).toHaveBeenCalledTimes(1));
});

it("非自动起草的候选、或稿面有未保存修改时，不自动写入（保留手动采纳）", async () => {
  render(<ChatScriptDraftCard taskId="task-manual" projectId="p5" error={null} pollIntervalMs={0} />);
  await waitFor(() => expect(document.querySelector('[data-slot="chat-script-write"]')).not.toBeNull());
  markAutoFirstDraft("p6"); const end = beginForegroundActivity("脚本有未保存的修改");
  render(<ChatScriptDraftCard taskId="task-dirty" projectId="p6" error={null} pollIntervalMs={0} />);
  await waitFor(() => expect(document.querySelectorAll('[data-slot="chat-script-write"]').length).toBe(2));
  expect(confirmTask).not.toHaveBeenCalled(); end();
});
