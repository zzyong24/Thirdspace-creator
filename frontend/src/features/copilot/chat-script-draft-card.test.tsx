import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-268] 对话内整稿卡:script.draft 工具 dispatch 异步整稿(不再 inline 同步跑)后返回 { taskId }。
// 卡据 taskId 轮询 getTask → awaiting_confirmation 后 listTaskResults 拿候选整稿分段 → 「采纳写入
// 稿面」confirmTask(→ output_script append)→ **发 SCRIPT_WRITE 局部刷新信号**(不 router.refresh)。
//   - dispatch 失败态(error 非 null / 无 taskId)→ 卡渲诚实错误,不轮询。
//   - 轮询到 awaiting_confirmation → 渲整稿分段 + 采纳按钮。
//   - 点采纳 → confirmTask + emitScriptWrite(稿面编辑器局部刷新,不整页 refresh)。

// [T-273] 采纳后 emit(在稿面时当场刷新)+ router.refresh 兜底(在稿面外时服务端重读)。
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));

const getTask = vi.fn();
const listTaskResults = vi.fn();
const confirmTask = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    getTask: (...a: unknown[]) => getTask(...a),
    listTaskResults: (...a: unknown[]) => listTaskResults(...a),
    confirmTask: (...a: unknown[]) => confirmTask(...a),
  },
}));

import { ChatScriptDraftCard } from "./chat-script-draft-card";
import { SCRIPT_WRITE_EVENT } from "@/features/script/script-write-signal";

const CANDIDATE_SECTIONS = [
  { heading: "1. 开场(0-3s)", body: "口播:90% 的文档没人看完" },
  { heading: "2. 痛点", body: "口播:因为你没在前 3 秒给理由" },
  { heading: "3. CTA", body: "口播:关注我,下一条讲怎么写钩子" },
];

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  getTask.mockResolvedValue({ status: "awaiting_confirmation" });
  // script-runner recordCandidate 的 resultData 形状:{ body, summary, sections, hook, cta,
  // contentData:{ sections:[{heading,body}], hook, cta } }。卡优先取 contentData.sections。
  listTaskResults.mockResolvedValue([
    {
      resultData: {
        body: "# 分镜脚本",
        summary: "整稿草稿",
        validationStatus: "valid",
        validationErrors: [],
        canAdopt: true,
        contentData: { sections: CANDIDATE_SECTIONS, hook: "H", cta: "C" },
      },
    },
  ]);
  confirmTask.mockResolvedValue({ id: "task-draft-1", status: "succeeded" });
});

describe("ChatScriptDraftCard(对话内整稿卡,T-268 异步)", () => {
  it("dispatch 失败(error 非 null)→ 诚实错误态,不轮询", () => {
    render(
      <ChatScriptDraftCard
        taskId={null}
        projectId={null}
        error="整稿要落进具体项目的稿面 —— 请在项目稿面右栏让我写脚本。"
        pollIntervalMs={0}
      />,
    );
    expect(
      document.querySelector('[data-slot="chat-script-error"]')?.textContent,
    ).toContain("稿面");
    expect(getTask).not.toHaveBeenCalled();
  });

  it("轮询 awaiting_confirmation → 渲整稿分段候选 + 采纳按钮", async () => {
    render(
      <ChatScriptDraftCard
        taskId="task-draft-1"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-script-review"]'),
      ).toBeTruthy();
    });
    const review = document.querySelector('[data-slot="chat-script-review"]')!;
    expect(review.textContent).toContain("开场");
    expect(review.textContent).toContain("痛点");
    expect(
      document.querySelector('[data-slot="chat-script-write"]'),
    ).toBeTruthy();
    expect(confirmTask).not.toHaveBeenCalled();
  });

  it("服务端判定单段候选可采纳时仍开放采纳，前端不硬编码段数或 CTA", async () => {
    listTaskResults.mockResolvedValueOnce([
      {
        resultData: {
          validationStatus: "valid",
          validationErrors: [],
          canAdopt: true,
          contentData: {
            sections: [{ heading: "独白", body: "当前 Skill 允许的一段式独白" }],
          },
        },
      },
    ]);

    render(
      <ChatScriptDraftCard
        taskId="task-one-segment"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );

    expect(await screen.findByText("当前 Skill 允许的一段式独白")).toBeTruthy();
    expect(screen.getByText("采纳写入稿面")).toBeTruthy();
  });

  it("invalid 候选显示服务端人话原因并隐藏采纳按钮", async () => {
    listTaskResults.mockResolvedValueOnce([
      {
        resultData: {
          validationStatus: "invalid",
          validationErrors: [
            "当前写稿技能要求至少 6 段，本次只有 1 段，请重新生成。",
          ],
          canAdopt: false,
          contentData: {
            sections: [{ heading: "开场", body: "只有一段" }],
          },
        },
      },
    ]);

    render(
      <ChatScriptDraftCard
        taskId="task-invalid"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );

    expect(
      await screen.findByText(
        "当前写稿技能要求至少 6 段，本次只有 1 段，请重新生成。",
      ),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-slot="chat-script-write"]'),
    ).toBeNull();
    expect(confirmTask).not.toHaveBeenCalled();
  });

  it("旧候选缺少完整性三字段时 fail-closed，提示重新生成且不可采纳", async () => {
    listTaskResults.mockResolvedValueOnce([
      {
        resultData: {
          contentData: { sections: CANDIDATE_SECTIONS },
        },
      },
    ]);

    render(
      <ChatScriptDraftCard
        taskId="task-legacy"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );

    expect(await screen.findByText(/旧候选缺少完整性校验/)).toBeTruthy();
    expect(
      document.querySelector('[data-slot="chat-script-write"]'),
    ).toBeNull();
  });

  it("点「采纳写入稿面」→ confirmTask + 发 SCRIPT_WRITE 局部刷新信号(不整页 refresh)", async () => {
    const onWrite = vi.fn();
    window.addEventListener(SCRIPT_WRITE_EVENT, onWrite);
    render(
      <ChatScriptDraftCard
        taskId="task-draft-1"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    const adopt = await screen.findByText("采纳写入稿面");
    fireEvent.click(adopt);
    await waitFor(() => {
      expect(confirmTask).toHaveBeenCalledWith({
        params: { taskId: "task-draft-1" },
        query: undefined,
        body: undefined,
      });
    });
    // 局部刷新信号发出,detail 带整稿 HTML(编辑器 setContent 用)。
    await waitFor(() => expect(onWrite).toHaveBeenCalled());
    const ev = onWrite.mock.calls[0]![0] as CustomEvent<{ html: string }>;
    expect(ev.detail.html).toContain("<h2>");
    expect(ev.detail.html).toContain("90%");
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-script-done"]'),
      ).toBeTruthy();
    });
    window.removeEventListener(SCRIPT_WRITE_EVENT, onWrite);
  });

  it("任务 cancelled/failed(如未配模型)→ 诚实错误态 +「去设置」", async () => {
    getTask.mockResolvedValue({ status: "failed" });
    render(
      <ChatScriptDraftCard
        taskId="task-draft-1"
        projectId="proj-1"
        error={null}
        pollIntervalMs={0}
      />,
    );
    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="chat-script-error"]'),
      ).toBeTruthy();
    });
    expect(
      document.querySelector('[data-slot="chat-script-settings-link"]'),
    ).toBeTruthy();
    expect(confirmTask).not.toHaveBeenCalled();
  });
});
