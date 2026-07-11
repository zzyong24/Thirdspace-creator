/**
 * Behavior tests for the AI Copilot composer (page-specs §16; T-004 ChatBox slice 1).
 *
 * The composer is now driven by `useChat` (@ai-sdk/react) streaming against `/api/chat`
 * (NOT the old createMessage→poll-listMessages loop). These tests mock `@ai-sdk/react`'s
 * `useChat` so the composer can be exercised in jsdom WITHOUT a real stream (real streaming
 * needs a dev server + model key — covered by the server-side assembly unit tests instead).
 * They assert: submit calls `sendMessage({text})` + clears the composer; `stop()` shows
 * while streaming; the dashboard 继续任务 feed still works; and a `topic.generate` tool result
 * renders an in-chat candidate card that adopts through the candidates.create confirm gate.
 */

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listTasks = vi.fn();
const createCandidate = vi.fn();
// 会话持久化(本切片):读回历史 / 历史记录列表 走这两个契约读 op。
const listMessages = vi.fn();
const listConversations = vi.fn();
// T-039b @项目引用:输入 @ 弹项目列表走这个只读 op。
const listProjects = vi.fn();

// 「继续」 routing uses next/navigation's useRouter; mock it so the island mounts
// under the test renderer (no real app-router provider).
const routerPush = vi.fn();
const routerRefresh = vi.fn();
// slice 2:面板读 ?surface & ?fn 装配 ChatContext + 预调工具。默认 query 无 fn(不自动预调),
// 个别用例改 mockSearch 注入 fn 断言预调。
let mockSearch = "copilot=open";
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: routerRefresh,
  }),
  useSearchParams: () => new URLSearchParams(mockSearch),
}));

const createLearning = vi.fn();
vi.mock("@/lib/contract-client", () => ({
  client: {
    // GAP-COP-feed: the 最近任务 / 继续任务 feeds load from the real op on mount.
    listAITasks: (...args: unknown[]) => listTasks(...args),
    // T-004: in-chat candidate adoption goes through the candidates.create confirm gate.
    createCandidate: (...args: unknown[]) => createCandidate(...args),
    // slice 2:复盘经验候选采纳 → learnings.create 直采门。
    createLearning: (...args: unknown[]) => createLearning(...args),
    // 会话持久化:二次进入读回 + 历史记录列表。
    listMessages: (...args: unknown[]) => listMessages(...args),
    listConversations: (...args: unknown[]) => listConversations(...args),
    // T-039b @项目引用:项目补全下拉的数据源。
    listProjects: (...args: unknown[]) => listProjects(...args),
  },
}));

// Mock useChat so the composer can be driven deterministically (no real /api/chat stream).
// `sendMessage` is captured; `messages` / `status` are injected per-test via the controls.
const sendMessage = vi.fn();
const stop = vi.fn();
const setMessages = vi.fn();
let mockMessages: Array<{
  id: string;
  role: "user" | "assistant";
  parts: Array<Record<string, unknown>>;
}> = [];
let mockStatus = "ready";
// [T-231⑩] error/regenerate 可注入:断言「出错 → 重试按钮 → regenerate()」通路。
const regenerate = vi.fn();
let mockError: Error | null = null;
vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({
    messages: mockMessages,
    sendMessage: (...args: unknown[]) => sendMessage(...args),
    stop: (...args: unknown[]) => stop(...args),
    status: mockStatus,
    // 读回把历史喂 setMessages —— 捕获它断言二次进入读回。
    setMessages: (...args: unknown[]) => setMessages(...args),
    regenerate: (...args: unknown[]) => regenerate(...args),
    error: mockError,
  }),
}));

import { AICopilotContent } from "./ai-copilot-content";
import type { CopilotContentViewModel } from "./ai-copilot-content";

afterEach(() => cleanup());

const VM: CopilotContentViewModel = {
  scenario: "default",
  kind: "ai-copilot",
  loading: false,
  error: null,
  prompt: "",
  chips: [
    { id: "chip-1", label: "帮我写脚本开场", icon: "wand" },
    { id: "chip-2", label: "分析竞品", icon: "file-search" },
  ],
  recommendedCommands: [],
  recentTasks: [],
  continuingTasks: [],
  quickEntries: [],
  smartRecommendations: [],
};

beforeEach(() => {
  listTasks.mockReset();
  listTasks.mockResolvedValue([]);
  createCandidate.mockReset();
  createCandidate.mockResolvedValue({ id: "cand-1" });
  createLearning.mockReset();
  createLearning.mockResolvedValue({ id: "learn-1" });
  routerPush.mockReset();
  routerRefresh.mockReset();
  sendMessage.mockReset();
  stop.mockReset();
  setMessages.mockReset();
  listMessages.mockReset();
  listMessages.mockResolvedValue([]);
  listConversations.mockReset();
  listConversations.mockResolvedValue([]);
  listProjects.mockReset();
  listProjects.mockResolvedValue([]);
  mockMessages = [];
  mockStatus = "ready";
  mockSearch = "copilot=open";
  regenerate.mockReset();
  mockError = null;
  // 每个用例从干净的会话存档起步(前一个用例可能写过 localStorage)。
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});

describe("AI Copilot composer behavior (useChat-driven, T-004)", () => {
  it("renders a CopilotHeader (page-specs §16 component tree)", () => {
    render(<AICopilotContent viewModel={VM} />);
    expect(document.querySelector('[data-slot="copilot-header"]')).not.toBeNull();
  });

  it("submit is disabled when empty, enabled after typing", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const submit = screen.getByLabelText("提交提示给 Copilot");
    expect(submit).toBeDisabled();

    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "你好");
    expect(submit).not.toBeDisabled();
  });

  it("submitting calls sendMessage({text}) and clears the composer", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "基于最近评论出 5 个选题");

    await user.click(screen.getByLabelText("提交提示给 Copilot"));

    expect(sendMessage).toHaveBeenCalledWith({
      text: "基于最近评论出 5 个选题",
    });
    expect(textarea.value).toBe("");
  });

  // [T-233] Enter=换行(治打字误发);Cmd/Ctrl+Enter 或 Shift+Enter 才发送。
  it("[T-233] 纯 Enter 不发送(换行),Cmd+Enter 发送", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "第一行");
    await user.keyboard("{Enter}");
    // 纯 Enter → 不发送,光标处插入换行。
    expect(sendMessage).not.toHaveBeenCalled();
    expect(textarea.value).toBe("第一行\n");

    await user.type(textarea, "第二行");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(sendMessage).toHaveBeenCalledWith({ text: "第一行\n第二行" });
  });

  it("[T-233] Shift+Enter 也发送(宽容两种修饰键)", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.type(textarea, "一句话");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    expect(sendMessage).toHaveBeenCalledWith({ text: "一句话" });
  });

  it("shows a stop button (not submit) while streaming", () => {
    mockStatus = "streaming";
    render(<AICopilotContent viewModel={VM} />);
    expect(screen.queryByTestId("stop-button")).not.toBeNull();
    expect(screen.queryByTestId("submit-button")).toBeNull();
  });

  it("renders assistant text parts + a topic.generate candidate card, and 采纳 calls candidates.create", async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: "a-1",
        role: "assistant",
        parts: [
          { type: "text", text: "给你出 1 个选题：" },
          {
            // useChat tool part shape: type `tool-<name>`, state output-available, output.
            type: "tool-topic.generate",
            toolCallId: "tc-1",
            state: "output-available",
            input: { basis: "comments" },
            output: {
              kind: "topic.candidates",
              items: [
                {
                  title: "反直觉开头对你有效",
                  angle: "用数据打破直觉",
                  contentRole: "traffic",
                  predictedScore: 82,
                  reason: "评论里反复问",
                },
              ],
            },
          },
        ],
      },
    ];

    render(<AICopilotContent viewModel={VM} />);

    // assistant text bubble renders.
    expect(screen.getByText("给你出 1 个选题：")).not.toBeNull();
    // candidate card renders the tool-result candidate.
    const card = document.querySelector('[data-slot="chat-candidate-card"]');
    expect(card).not.toBeNull();
    expect(screen.getByText("反直觉开头对你有效")).not.toBeNull();

    // 采纳 → candidates.create (confirm gate; AI never writes the entity directly).
    await user.click(screen.getByText("采纳"));
    await waitFor(() => {
      expect(createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            title: "反直觉开头对你有效",
            angle: "用数据打破直觉",
            source: "idea",
            contentRole: "traffic",
          }),
        }),
      );
    });
  });

  it("slice 2:渲染 calibration.diagnose 工具结果为维度评分卡(只读展示)", () => {
    mockMessages = [
      {
        id: "a-2",
        role: "assistant",
        parts: [
          { type: "text", text: "诊断如下：" },
          {
            type: "tool-calibration.diagnose",
            toolCallId: "tc-2",
            state: "output-available",
            input: { title: "我的视频" },
            output: {
              kind: "calibration.diagnosis",
              diagnosis: {
                dimensions: [
                  { key: "hook", score: 4, reason: "开头强", suggestion: "保持" },
                ],
                verdict: "可发",
                mainIssues: ["结尾弱"],
                priorityFixes: ["加 CTA"],
              },
            },
          },
        ],
      },
    ];
    render(<AICopilotContent viewModel={VM} />);
    expect(
      document.querySelector('[data-slot="chat-diagnosis-card"]'),
    ).not.toBeNull();
    expect(screen.getByText("4 / 5")).not.toBeNull();
    expect(screen.getByText(/综合判断/)).not.toBeNull();
  });

  it("slice 2:渲染 review.analyze 工具结果为经验卡,采纳 → learnings.create", async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: "a-3",
        role: "assistant",
        parts: [
          {
            type: "tool-review.analyze",
            toolCallId: "tc-3",
            state: "output-available",
            input: { subject: "我的视频" },
            output: {
              kind: "review.learnings",
              items: [{ title: "前3秒给结果", insight: "完播更高" }],
            },
          },
        ],
      },
    ];
    render(<AICopilotContent viewModel={VM} />);
    expect(
      document.querySelector('[data-slot="chat-learnings-card"]'),
    ).not.toBeNull();
    await user.click(screen.getByText("采纳"));
    await waitFor(() => {
      expect(createLearning).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { title: "前3秒给结果", insight: "完播更高" },
        }),
      );
    });
  });

  it("[T-055b] 一键岛预填 —— 面板带 ?fn 打开且对话为空 → 话术写进输入框,绝不自动发送", async () => {
    // 模拟从校准「对话诊断」深链进入:?surface=calibration&fn=calibration.diagnose。
    // SPEC §5.1:预填只写 input value,用户回车才发(治「点击后内容重复两遍」)。
    mockSearch = "copilot=open&surface=calibration&fn=calibration.diagnose";
    render(<AICopilotContent viewModel={VM} />);
    await waitFor(() => {
      const input = screen.getByLabelText(
        "我能帮你做什么",
      ) as HTMLTextAreaElement;
      expect(input.value).toContain("诊断");
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("[T-108] embed.request(autoSend)—— 稿面按钮请求进 rail → 自动 sendMessage 那句话术(不等回车)", async () => {
    // 稿面右栏常驻 rail:embed.selection=project(项目上下文常驻)+ request 带 content_output +
    // autoSend。首帧 request=null,rerender 带一个 nonce=1 的请求 → effect 自动发。
    const embedBase = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
    } as const;
    const { rerender } = render(
      <AICopilotContent viewModel={VM} embed={{ ...embedBase, request: null }} />,
    );
    expect(sendMessage).not.toHaveBeenCalled();
    rerender(
      <AICopilotContent
        viewModel={VM}
        embed={{
          ...embedBase,
          request: {
            functionKey: "review.script",
            prefill: "审核这份文案:跑一遍违禁词/合规诊断,命中给逐条改写建议。",
            autoSend: true,
            selection: { kind: "content_output", id: "co-1", title: "我的作品" },
            nonce: 1,
          },
        }}
      />,
    );
    // autoSend → 自动发那句审核话术(而不是写进输入框等回车)。
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        text: "审核这份文案:跑一遍违禁词/合规诊断,命中给逐条改写建议。",
      });
    });
  });

  it("[T-108] embed.request(autoSend)—— content_output subject 进 chip,项目 chip 仍常驻(项目上下文不丢)", async () => {
    const embedBase = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
    } as const;
    render(
      <AICopilotContent
        viewModel={VM}
        embed={{
          ...embedBase,
          request: {
            functionKey: "review.script",
            prefill: "审核",
            autoSend: true,
            selection: { kind: "content_output", id: "co-1", title: "我的作品" },
            nonce: 1,
          },
        }}
      />,
    );
    // 项目 chip(embed.selection)常驻(不因 request 把 subject 换成 content_output 而消失),
    // 且稿面常驻项目上下文不给「摘除」按钮(它是本页固定归属)。
    const projectChip = document.querySelector(
      '[data-slot="context-chip"][data-kind="project"][data-project-id="proj-1"]',
    );
    expect(projectChip).not.toBeNull();
    expect(
      projectChip!.querySelector('[data-slot="context-chip-remove"]'),
    ).toBeNull();
    // content_output subject 走 objectChip。
    const objectChip = document.querySelector(
      '[data-slot="context-chip"][data-kind="content_output"]',
    );
    expect(objectChip).not.toBeNull();
  });

  it("renders the REAL continuing-task feed (in-progress only) and 「继续」 routes to the task's project/stage", async () => {
    const user = userEvent.setup();
    listTasks.mockResolvedValue([
      {
        id: "t-running",
        projectId: "proj-1",
        taskType: "script.draft",
        status: "running",
        requestedAt: "2026-06-25T00:00:00.000Z",
      },
      {
        id: "t-done",
        projectId: "proj-3",
        taskType: "research.gather",
        status: "succeeded",
        requestedAt: "2026-06-25T00:00:00.000Z",
      },
      {
        id: "t-global",
        projectId: null,
        taskType: "topic.generate",
        status: "queued",
        requestedAt: "2026-06-25T00:00:00.000Z",
      },
    ]);

    render(<AICopilotContent viewModel={VM} />);

    await waitFor(() => {
      expect(
        document.querySelector(
          '[data-slot="continuing-task"][data-task-id="t-running"]',
        ),
      ).not.toBeNull();
    });
    // terminal task filtered OUT of 继续任务.
    expect(
      document.querySelector(
        '[data-slot="continuing-task"][data-task-id="t-done"]',
      ),
    ).toBeNull();

    // global (no-projectId) task shown but its 继续 disabled.
    const globalResume = document.querySelector(
      '[data-slot="continuing-resume"][data-task-id="t-global"]',
    ) as HTMLButtonElement;
    expect(globalResume).not.toBeNull();
    expect(globalResume.disabled).toBe(true);

    const resume = document.querySelector(
      '[data-slot="continuing-resume"][data-task-id="t-running"]',
    ) as HTMLButtonElement;
    await user.click(resume);
    // [T-076] 两阶段化:script.* 任务的「继续」落稿面(/projects/<id>),不再拼阶段子路由。
    expect(routerPush).toHaveBeenCalledWith("/projects/proj-1");
  });

  it("clicking a suggested-action chip fills the composer with its label", async () => {
    const user = userEvent.setup();
    render(<AICopilotContent viewModel={VM} />);
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    expect(textarea.value).toBe("");

    await user.click(screen.getByText("帮我写脚本开场"));
    expect(textarea.value).toBe("帮我写脚本开场");
    expect(screen.getByLabelText("提交提示给 Copilot")).not.toBeDisabled();
  });

  it("[T-231⑨] 带 prefill 的 chip → 预填完整话术(非 label),且**不自动发送**(T-055b)", async () => {
    const user = userEvent.setup();
    render(
      <AICopilotContent
        viewModel={{
          ...VM,
          chips: [
            {
              id: "script",
              label: "生成脚本",
              icon: "wand",
              functionKey: "script.draft",
              prefill: "帮我为这条内容起草一版完整的分镜口播脚本。",
            },
          ],
        }}
      />,
    );
    const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;
    await user.click(screen.getByText("生成脚本"));
    // 完整话术进输入框(不是 label 字条),但绝不自动发。
    expect(textarea.value).toBe("帮我为这条内容起草一版完整的分镜口播脚本。");
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("[T-231⑩] 对话出错 → 渲「重试」按钮,点击走 regenerate()(重发最后一轮)", async () => {
    const user = userEvent.setup();
    mockError = new Error("boom");
    mockMessages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "你好" }] },
    ];
    render(<AICopilotContent viewModel={VM} />);
    const retry = document.querySelector(
      '[data-slot="copilot-error-retry"]',
    ) as HTMLButtonElement;
    expect(retry).not.toBeNull();
    await user.click(retry);
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it("[T-096 矩阵#3] 会话持久化:该 scope 存过 conversationId → 挂载读回历史(左下角开→关→再开恢复同一会话)", async () => {
    // 预置该 scope(裸打开 = global,不再借 topics 桶)的指针 + 后端返回两条历史消息。
    window.localStorage.setItem("copilot:conv:global", "conv-restore");
    listMessages.mockResolvedValueOnce([
      { id: "m1", role: "user", content: "上次问的" },
      { id: "m2", role: "assistant", content: "上次答的" },
    ]);
    render(<AICopilotContent viewModel={VM} />);

    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { conversationId: "conv-restore" },
        }),
      );
    });
    // 映射后的 UIMessage[] 喂给 setMessages(读回填充对话)。
    await waitFor(() => {
      expect(setMessages).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "上次问的" }],
        }),
        expect.objectContaining({
          id: "m2",
          role: "assistant",
          parts: [{ type: "text", text: "上次答的" }],
        }),
      ]);
    });
  });

  it("[T-096] 会话持久化:指针读回失败(会话被删)→ 清失效指针 + 落服务端兜底,自愈不毁档", async () => {
    window.localStorage.setItem("copilot:conv:global", "conv-gone");
    listMessages.mockRejectedValueOnce(new Error("404 conversation not found"));
    render(<AICopilotContent viewModel={VM} />);

    await waitFor(() => {
      expect(listMessages).toHaveBeenCalled();
    });
    // 失效指针被清除;随即走服务端兜底(listConversations?scope=global,mock 空 → 诚实空会话)。
    await waitFor(() => {
      expect(window.localStorage.getItem("copilot:conv:global")).toBeNull();
    });
    await waitFor(() => {
      expect(listConversations).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ scope: "global" }),
        }),
      );
    });
  });

  it("[T-096 矩阵#4] 清 localStorage 后再开 → 服务端兜底恢复该 scope 最近会话(根因链 3/4 根治)", async () => {
    // 无任何本地指针;服务端该 scope 有一条最近会话 → 自动恢复它的消息。
    listConversations.mockResolvedValueOnce([
      { id: "conv-latest", title: "上次的全局对话", createdAt: "2026-07-01T08:00:00.000Z" },
    ]);
    listMessages.mockResolvedValueOnce([
      { id: "m1", role: "assistant", content: "我们上次聊到这里" },
    ]);
    render(<AICopilotContent viewModel={VM} />);

    // 兜底查询限定当前 scope(global),只取最近一条。
    await waitFor(() => {
      expect(listConversations).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ page: 1, pageSize: 1, scope: "global" }),
        }),
      );
    });
    // 恢复该会话:读回消息 + 指针重建。
    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ params: { conversationId: "conv-latest" } }),
      );
    });
    await waitFor(() => {
      expect(window.localStorage.getItem("copilot:conv:global")).toBe(
        "conv-latest",
      );
    });
  });

  it("[T-096 矩阵#5] 选题岛「新对话」只清 surface:topics 指针,global 指针纹丝不动(不同桶互不覆盖)", async () => {
    const user = userEvent.setup();
    // 左下角(global)已有延续中的会话指针;当前面板从选题岛打开(surface=topics)。
    window.localStorage.setItem("copilot:conv:global", "conv-global-keep");
    window.localStorage.setItem("copilot:conv:surface:topics", "conv-topics");
    mockSearch = "copilot=open&surface=topics";
    render(<AICopilotContent viewModel={VM} />);

    await user.click(screen.getByRole("button", { name: /新对话/ }));
    // 选题岛自己的桶被清;global 桶不受影响。
    expect(
      window.localStorage.getItem("copilot:conv:surface:topics"),
    ).toBeNull();
    expect(window.localStorage.getItem("copilot:conv:global")).toBe(
      "conv-global-keep",
    );
  });

  it("[T-096 矩阵#9] 历史记录:点开 → listConversations 只列当前 scope;点某条 → 读回该会话消息", async () => {
    const user = userEvent.setup();
    // 第一次调用是挂载时的服务端兜底(该 scope 无历史);第二次才是「历史记录」面板。
    listConversations.mockResolvedValueOnce([]);
    listConversations.mockResolvedValueOnce([
      { id: "conv-a", title: "选题：AI 浏览器", createdAt: "2026-06-20T08:30:00.000Z" },
      { id: "conv-b", title: "选题：短视频留存", createdAt: "2026-06-21T09:00:00.000Z" },
    ]);
    listMessages.mockResolvedValueOnce([
      { id: "x1", role: "assistant", content: "会话 A 的历史" },
    ]);
    render(<AICopilotContent viewModel={VM} />);
    // 等挂载兜底完成,避免与面板懒加载竞争 mock 队列。
    await waitFor(() => expect(listConversations).toHaveBeenCalledTimes(1));

    // 点「历史记录」→ 懒加载列表(限定当前 scope=global —— 跨 scope 会话不出现)。
    await user.click(screen.getByRole("button", { name: /历史记录/ }));
    await waitFor(() => {
      expect(listConversations).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({ scope: "global" }),
        }),
      );
    });
    // 面板标注范围(诚实提示只列本入口)。
    expect(
      document.querySelector('[data-slot="copilot-history-scope"]'),
    ).not.toBeNull();
    const item = await screen.findByText("选题：AI 浏览器");
    expect(item).not.toBeNull();

    // 点某条 → 读回该会话消息(listMessages 带其 id + setMessages 填充)。
    await user.click(item);
    await waitFor(() => {
      expect(listMessages).toHaveBeenCalledWith(
        expect.objectContaining({ params: { conversationId: "conv-a" } }),
      );
    });
    await waitFor(() => {
      expect(setMessages).toHaveBeenCalledWith([
        expect.objectContaining({
          id: "x1",
          parts: [{ type: "text", text: "会话 A 的历史" }],
        }),
      ]);
    });
  });

  it("新对话:点「新对话」→ 清空会话 + 清当前 scope 的指针(同 scope 内新开一条)", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("copilot:conv:global", "conv-existing");
    render(<AICopilotContent viewModel={VM} />);

    await user.click(screen.getByRole("button", { name: /新对话/ }));
    expect(setMessages).toHaveBeenCalledWith([]);
    expect(window.localStorage.getItem("copilot:conv:global")).toBeNull();
  });

  describe("T-039b @项目引用", () => {
    it("输入 @ → 懒加载真项目列表(client.listProjects)并弹出补全下拉", async () => {
      const user = userEvent.setup();
      listProjects.mockResolvedValue([
        { id: "proj-1", title: "上下文工程" },
        { id: "proj-2", title: "RAG 检索优化" },
      ]);
      render(<AICopilotContent viewModel={VM} />);
      const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;

      await user.type(textarea, "帮我基于 @");
      // 懒加载真项目列表。
      await waitFor(() => {
        expect(listProjects).toHaveBeenCalled();
      });
      // 下拉出现 + 列出真项目。
      const menu = await screen.findByRole("listbox", { name: "引用项目" });
      expect(menu).not.toBeNull();
      expect(screen.getByText("上下文工程")).not.toBeNull();
      expect(screen.getByText("RAG 检索优化")).not.toBeNull();
    });

    it("@ 后接查询串 → 按标题过滤候选", async () => {
      const user = userEvent.setup();
      listProjects.mockResolvedValue([
        { id: "proj-1", title: "上下文工程" },
        { id: "proj-2", title: "RAG 检索优化" },
      ]);
      render(<AICopilotContent viewModel={VM} />);
      const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;

      await user.type(textarea, "@RAG");
      await waitFor(() => expect(listProjects).toHaveBeenCalled());
      // 只剩匹配「RAG」的项目。
      await waitFor(() => {
        expect(screen.getByText("RAG 检索优化")).not.toBeNull();
      });
      expect(screen.queryByText("上下文工程")).toBeNull();
    });

    it("选中某项目 → 插入 @标题 chip + 显式项目引用 chip(注入 chatContext 的可见凭证)", async () => {
      const user = userEvent.setup();
      listProjects.mockResolvedValue([{ id: "proj-1", title: "上下文工程" }]);
      render(<AICopilotContent viewModel={VM} />);
      const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;

      await user.type(textarea, "@上下");
      await waitFor(() => expect(listProjects).toHaveBeenCalled());
      const option = await screen.findByRole("option", { name: /上下文工程/ });
      await user.click(option);

      // textarea 里 @上下 被替换成 @上下文工程(+尾空格)。
      await waitFor(() => {
        expect(textarea.value).toContain("@上下文工程");
      });
      // 显式的项目引用 chip 出现(带 projectId),= 本次对话已注入该项目的可见凭证。
      const chip = document.querySelector(
        '[data-slot="context-chip"][data-kind="project"][data-project-id="proj-1"]',
      );
      expect(chip).not.toBeNull();
    });

    it("[T-055b gate-F2] URL 选中态 → 头部常驻 @项目 chip;点 × 摘除后不再注入", async () => {
      const user = userEvent.setup();
      // 模拟一键岛带项目选中态打开(kind=project)。
      mockSearch =
        "copilot=open&surface=review&selKind=project&selId=proj-9&selTitle=" +
        encodeURIComponent("22个没法看的复盘");
      render(<AICopilotContent viewModel={VM} />);
      const chip = document.querySelector(
        '[data-slot="context-chip"][data-kind="project"][data-project-id="proj-9"]',
      );
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toContain("22个没法看的复盘");

      await user.click(screen.getByLabelText("移除项目上下文"));
      expect(
        document.querySelector('[data-slot="context-chip"][data-kind="project"]'),
      ).toBeNull();
      // 摘除后显式回落「未关联项目」空态(gate-F2:缺失不静默)。
      expect(
        document.querySelector('[data-slot="context-chip-empty"]'),
      ).not.toBeNull();
    });

    it("[T-055b gate-F2] 无任何上下文 → 显式「未关联项目」空 chip,不静默", () => {
      render(<AICopilotContent viewModel={VM} />);
      const empty = document.querySelector('[data-slot="context-chip-empty"]');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toContain("未关联项目");
    });

    it("移除项目引用 chip → chip 消失(撤销注入)", async () => {
      const user = userEvent.setup();
      listProjects.mockResolvedValue([{ id: "proj-1", title: "上下文工程" }]);
      render(<AICopilotContent viewModel={VM} />);
      const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;

      await user.type(textarea, "@");
      await waitFor(() => expect(listProjects).toHaveBeenCalled());
      const option = await screen.findByRole("option", { name: /上下文工程/ });
      await user.click(option);
      expect(
        document.querySelector('[data-slot="context-chip"][data-kind="project"]'),
      ).not.toBeNull();

      await user.click(screen.getByLabelText("移除项目上下文"));
      expect(
        document.querySelector('[data-slot="context-chip"][data-kind="project"]'),
      ).toBeNull();
    });

    it("库里没有项目 → 下拉显示诚实空态(引导先建项目,不摆假行)", async () => {
      const user = userEvent.setup();
      listProjects.mockResolvedValue([]);
      render(<AICopilotContent viewModel={VM} />);
      const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;

      await user.type(textarea, "@");
      await waitFor(() => expect(listProjects).toHaveBeenCalled());
      await waitFor(() => {
        expect(
          document.querySelector('[data-slot="project-mention-empty"]'),
        ).not.toBeNull();
      });
      // 没有任何候选行。
      expect(
        document.querySelector('[data-slot="project-mention-option"]'),
      ).toBeNull();
    });
  });
});
