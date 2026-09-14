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
const openExternalUrl = vi.fn();
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => openExternalUrl(...args),
}));
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
let initialChatTransport: { body?: unknown } | null = null;
// T-954：真实组件已改用持久 Chat 会话；替身仍保留首个 transport 检查发送时上下文。
let mockedLiveSession: object | null = null;
vi.mock("./live-chat-session", () => ({
  getLiveChatSession: () => {
    mockedLiveSession ??= {
      chat: { messages: [], status: "ready" },
      control: { fetch: vi.fn(), cancel: vi.fn(async () => {}) },
      conversationId: null,
      epoch: 0,
      get transport() { return initialChatTransport; },
      set transport(value: { body?: unknown } | null) { initialChatTransport ??= value; },
    };
    return mockedLiveSession;
  },
}));
vi.mock("@ai-sdk/react", () => ({
  useChat: (options?: { transport?: { body?: unknown } }) => {
    // AI SDK 的对话实例在首次挂载时持有 transport。测试故意保留第一个
    // transport，用来复现「右侧 chip 已更新，真实请求却还读首帧旧上下文」。
    if (!initialChatTransport && options?.transport) {
      initialChatTransport = options.transport;
    }
    return {
      messages: mockMessages,
      sendMessage: (...args: unknown[]) => sendMessage(...args),
      stop: (...args: unknown[]) => stop(...args),
      status: mockStatus,
      // 读回把历史喂 setMessages —— 捕获它断言二次进入读回。
      setMessages: (...args: unknown[]) => setMessages(...args),
      regenerate: (...args: unknown[]) => regenerate(...args),
      error: mockError,
    };
  },
}));

import {
  AICopilotContent,
  createOneShotFunctionKey,
} from "./ai-copilot-content";
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
  mockedLiveSession = null;
  listTasks.mockReset();
  listTasks.mockResolvedValue([]);
  createCandidate.mockReset();
  createCandidate.mockResolvedValue({ id: "cand-1" });
  createLearning.mockReset();
  createLearning.mockResolvedValue({ id: "learn-1" });
  routerPush.mockReset();
  routerRefresh.mockReset();
  openExternalUrl.mockReset();
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
  initialChatTransport = null;
  // 每个用例从干净的会话存档起步(前一个用例可能写过 localStorage)。
  try {
    window.localStorage.clear();
  } catch {
    /* noop */
  }
});

describe("AI Copilot composer behavior (useChat-driven, T-004)", () => {
  it("[T-473] 深链/嵌入 functionKey 只消费一次，新命令到来才重新武装", () => {
    const command = createOneShotFunctionKey("topic.enrich");
    expect(command.consume()).toBe("topic.enrich");
    expect(command.consume()).toBeNull();
    command.sync("topic.enrich");
    expect(command.consume()).toBeNull();
    // 稿面同一个动作再次点击时 key 相同，但 nonce/命令身份已变，必须允许新一轮执行。
    command.sync("topic.enrich", "request:2");
    expect(command.consume()).toBe("topic.enrich");
    command.sync("review.script");
    expect(command.consume()).toBe("review.script");
    expect(command.consume()).toBeNull();
  });

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

  it("[T-813] 点击搜索卡阅读全文，同一轮发送可见 URL 与一次性 web.read 绑定", async () => {
    const user = userEvent.setup();
    mockMessages = [
      {
        id: "a-web-gather",
        role: "assistant",
        parts: [
          {
            type: "tool-material.gather",
            toolCallId: "tc-web-gather",
            state: "output-available",
            input: { query: "DeepSeek Harness" },
            output: {
              kind: "material.gather",
              grounding: "web",
              items: [
                {
                  title: "DeepSeek Harness 开发者预览版",
                  url: "https://example.com/harness#intro",
                  sourceUrl: "https://example.com/harness#intro",
                  source: "example.com",
                  whyRelevant: "介绍插件式 Harness",
                  category: "产品资料",
                },
              ],
            },
          },
        ],
      },
    ];
    render(<AICopilotContent viewModel={VM} />);

    await user.click(screen.getByRole("button", { name: "阅读全文" }));
    expect(sendMessage).toHaveBeenCalledWith({
      text: "请阅读全文：https://example.com/harness#intro",
    });

    const resolver = initialChatTransport?.body;
    expect(typeof resolver).toBe("function");
    const firstBody = await (
      resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
    )();
    expect(firstBody).toMatchObject({
      chatContext: {
        functionKey: "web.read",
        webReadUrl: "https://example.com/harness#intro",
      },
    });

    const nextBody = await (
      resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
    )();
    expect(nextBody).not.toMatchObject({
      chatContext: { functionKey: "web.read" },
    });
    expect(nextBody).not.toMatchObject({
      chatContext: { webReadUrl: expect.any(String) },
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
              projectId:"project-review",
              items: [{ title: "前3秒给结果", insight: "完播更高", source:"当前作品开头", applicability:"同主题的演示稿" }],
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
          body: { title: "前3秒给结果", insight: "完播更高", projectId:"project-review",source:"当前作品开头",applicability:"同主题的演示稿" },
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

  it("[T-623] embed.request without autoSend prefills the existing rail and waits for the user", async () => {
    const embedBase = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
    } as const;
    const { rerender } = render(
      <AICopilotContent viewModel={VM} embed={{ ...embedBase, request: null }} />,
    );
    rerender(
      <AICopilotContent
        viewModel={VM}
        embed={{
          ...embedBase,
          request: {
            functionKey: "review.analyze",
            prefill: "帮我复盘,提炼可复用的爆款要素沉淀成经验。",
            autoSend: false,
            selection: { kind: "project", id: "proj-1", title: "我的作品" },
            nonce: 1,
          },
        }}
      />,
    );

    await waitFor(() => {
      expect(
        (screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement).value,
      ).toBe("帮我复盘,提炼可复用的爆款要素沉淀成经验。");
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("[T-954] 内容诊断省略工具命令，不继承 URL 的局改命令，纯文本答复正常结束", async () => {
    mockSearch = "copilot=open&fn=script.patch";
    const embed = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
      request: {
        prefill: "判断当前稿的观看理由，不要自动改稿。",
        autoSend: true,
        selection: { kind: "project", id: "proj-1", artifactId: "artifact-1", versionId: "version-8" },
        nonce: 1,
      },
    } as const;
    const { rerender } = render(<AICopilotContent viewModel={VM} embed={embed} />);
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ text: embed.request.prefill }));
    const body = await (initialChatTransport!.body as () => Record<string, unknown>)();
    expect((body.chatContext as Record<string, unknown>).functionKey).toBeUndefined();
    expect(body).toMatchObject({ chatContext: { projectId: "proj-1", selection: { artifactId: "artifact-1", versionId: "version-8" } } });
    mockMessages = [{ id: "diagnosis", role: "assistant", parts: [{ type: "text", text: "当前稿开头的收益清楚，但例子缺少可核对来源。" }] }];
    rerender(<AICopilotContent viewModel={VM} embed={embed} />);
    await waitFor(() => expect(screen.getByText("当前稿开头的收益清楚，但例子缺少可核对来源。")).toBeTruthy());
    expect(screen.queryByText(/本轮回复没有生成可采纳的局部改稿候选/)).toBeNull();
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("[T-716] 新稿面命令原子替换话术与段落锚点，不保留旧话术却暗换上下文", async () => {
    const user = userEvent.setup();
    const embedBase = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
    } as const;
    const { rerender } = render(
      <AICopilotContent
        viewModel={VM}
        embed={{
          ...embedBase,
          request: {
            functionKey: "script.patch",
            prefill: "请只改写我选中的这一段。",
            selection: {
              kind: "script_section",
              id: "section-2",
              title: "第 2 段",
              artifactId: "artifact-1",
              versionId: "version-6",
              excerpt: "旧段落正文",
            },
            nonce: 1,
          },
        }}
      />,
    );
    const textarea = (await screen.findByLabelText(
      "我能帮你做什么",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("请只改写我选中的这一段。"));
    await user.type(textarea, " 具体讲清两种选题来源。");

    rerender(
      <AICopilotContent
        viewModel={VM}
        embed={{
          ...embedBase,
          request: {
            functionKey: "review.script",
            prefill: "审核当前完整文案。",
            selection: {
              kind: "content_output",
              id: "output-1",
              title: "当前稿件",
            },
            nonce: 2,
          },
        }}
      />,
    );

    await waitFor(() => expect(textarea.value).toBe("审核当前完整文案。"));
    expect(
      document.querySelector(
        '[data-slot="context-chip"][data-kind="content_output"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[data-slot="context-chip"][data-kind="script_section"]',
      ),
    ).toBeNull();
  });

  it("[T-716] 已挂载的对话 transport 每轮都读最新段落锚点，不发送首帧旧上下文", async () => {
    const embedBase = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
    } as const;
    const { rerender } = render(
      <AICopilotContent viewModel={VM} embed={{ ...embedBase, request: null }} />,
    );
    expect(initialChatTransport).not.toBeNull();

    rerender(
      <AICopilotContent
        viewModel={VM}
        embed={{
          ...embedBase,
          request: {
            functionKey: "script.patch",
            prefill: "请只改写我选中的这一段。",
            selection: {
              kind: "script_section",
              id: "section-2",
              title: "第 2 段",
              artifactId: "artifact-1",
              versionId: "version-8",
              sectionIndex: 1,
              excerpt: "当前稿面第 2 段",
            },
            nonce: 1,
          },
        }}
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="context-chip"][data-kind="script_section"]',
        ),
      ).not.toBeNull(),
    );

    const resolver = initialChatTransport?.body;
    expect(typeof resolver).toBe("function");
    const requestBody = await (
      resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
    )();
    expect(requestBody).toMatchObject({
      chatContext: {
        surface: "project",
        projectId: "proj-1",
        selection: {
          kind: "script_section",
          ids: ["section-2"],
          artifactId: "artifact-1",
          versionId: "version-8",
          sectionIndex: 1,
          excerpt: "当前稿面第 2 段",
        },
      },
    });
  });

  it("[T-716] 局部改稿失败保留段落锚点，成功后仍可围绕同一段连续修订", async () => {
    const user = userEvent.setup();
    const embed = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
      request: {
        functionKey: "script.patch",
        prefill: "请只改写我选中的这一段。",
        selection: {
          kind: "script_section",
          id: "section-2",
          title: "第 2 段",
          artifactId: "artifact-1",
          versionId: "version-6",
          sectionIndex: 1,
          excerpt: "旧段落正文",
        },
        nonce: 1,
      },
    } as const;
    const { rerender } = render(
      <AICopilotContent viewModel={VM} embed={embed} />,
    );
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="context-chip"][data-kind="script_section"]',
        ),
      ).not.toBeNull(),
    );
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    expect(sendMessage).toHaveBeenCalledWith({
      text: "请只改写我选中的这一段。",
    });

    // sendMessage 已提交并不等于局部候选成功。provider 中断时原段落必须仍在，且提示
    // 明确说明稿面未修改，避免用户误以为选区已丢或需要重新点按钮。
    mockMessages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "请只改写我选中的这一段。" }],
      },
    ];
    mockError = new Error("provider stream interrupted");
    rerender(<AICopilotContent viewModel={VM} embed={embed} />);
    expect(await screen.findByText(/目标段落已保留/)).toBeInTheDocument();
    expect(
      document.querySelector(
        '[data-slot="context-chip"][data-kind="script_section"]',
      ),
    ).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(regenerate).toHaveBeenCalledTimes(1);
    const retryResolver = initialChatTransport?.body;
    expect(typeof retryResolver).toBe("function");
    const retryBody = await (
      retryResolver as () =>
        | Promise<Record<string, unknown>>
        | Record<string, unknown>
    )();
    expect(retryBody).toMatchObject({
      chatContext: {
        functionKey: "script.patch",
        selection: { kind: "script_section" },
      },
    });

    mockError = null;
    mockMessages = [
      ...mockMessages,
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-script_patch",
            state: "output-available",
            input: { replacementText: "新段落正文" },
            output: {
              kind: "script.patch",
              artifactId: "artifact-1",
              versionId: "version-6",
              sectionId: "section-2",
              originalText: "旧段落正文",
              replacementText: "新段落正文",
              summary: "只改第 2 段",
            },
          },
        ],
      },
    ];
    rerender(<AICopilotContent viewModel={VM} embed={embed} />);
    expect(await screen.findByText("局部改稿候选")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="context-chip"][data-kind="script_section"]',
        ),
      ).not.toBeNull(),
    );

    // 候选回来后仍带着这段的可信锚点，但自由文本不再把一次性按钮命令跨轮复用。
    // 是否继续局改由同一个对话模型按本轮完整语义选择；用户也可以直接转向整稿。
    const textarea = screen.getByLabelText("我能帮你做什么");
    await user.type(textarea, "不是这个意思，请基于当前稿面的这一段再改一次。");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    expect(sendMessage).toHaveBeenLastCalledWith({
      text: "不是这个意思，请基于当前稿面的这一段再改一次。",
    });
    const resolver = initialChatTransport?.body;
    expect(typeof resolver).toBe("function");
    const requestBody = await (
      resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
    )();
    expect(requestBody).toMatchObject({
      chatContext: {
        selection: {
          kind: "script_section",
          artifactId: "artifact-1",
          versionId: "version-6",
          sectionIndex: 1,
        },
      },
    });
    expect(
      (requestBody.chatContext as Record<string, unknown>).functionKey,
    ).toBeUndefined();
  });

  it("[T-732] provider 失败后普通新消息不复用局部命令", async () => {
    const user = userEvent.setup();
    const embed = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
      request: {
        functionKey: "script.patch",
        prefill: "请只改写我选中的这一段。",
        selection: {
          kind: "script_section",
          id: "section-2",
          title: "第 2 段",
          artifactId: "artifact-1",
          versionId: "version-6",
          sectionIndex: 1,
          excerpt: "旧段落正文",
        },
        nonce: 1,
      },
    } as const;
    const { rerender } = render(
      <AICopilotContent viewModel={VM} embed={embed} />,
    );
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    mockMessages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: embed.request.prefill }],
      },
    ];
    mockError = new Error("provider stream interrupted");
    rerender(<AICopilotContent viewModel={VM} embed={embed} />);
    expect(await screen.findByText(/目标段落已保留/)).toBeInTheDocument();

    const textarea = screen.getByLabelText("我能帮你做什么");
    await user.type(textarea, "先不要改这一段，改为生成完整稿。");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    const resolver = initialChatTransport?.body;
    expect(typeof resolver).toBe("function");
    const body = await (
      resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
    )();
    expect(body).toMatchObject({
      chatContext: { selection: { kind: "script_section" } },
    });
    expect(
      (body.chatContext as Record<string, unknown>).functionKey,
    ).toBeUndefined();
  });

  it("[T-716] 模型只解释却未产出局部候选时结束 loading 并保留目标段", async () => {
    const user = userEvent.setup();
    const embed = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
      request: {
        functionKey: "script.patch",
        prefill: "请只改写我选中的这一段。",
        selection: {
          kind: "script_section",
          id: "section-2",
          title: "第 2 段",
          artifactId: "artifact-1",
          versionId: "version-8",
          sectionIndex: 1,
          excerpt: "当前段落正文",
        },
        nonce: 1,
      },
    } as const;
    const { rerender } = render(
      <AICopilotContent viewModel={VM} embed={embed} />,
    );
    await user.click(screen.getByLabelText("提交提示给 Copilot"));

    mockMessages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "请只改写我选中的这一段。" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "我先解释一下应该怎么改。" }],
      },
    ];
    mockStatus = "ready";
    rerender(<AICopilotContent viewModel={VM} embed={embed} />);

    expect(
      await screen.findByText(/没有生成可采纳的局部改稿候选/),
    ).toBeInTheDocument();
    expect(
      document.querySelector(
        '[data-slot="context-chip"][data-kind="script_section"]',
      ),
    ).not.toBeNull();
    expect(screen.queryByText("正在调用 局部改稿…")).not.toBeInTheDocument();

    // 失败命令只留给“重试”，普通新消息可以直接转为整稿；旧段落只是可选上下文，
    // 不能继续携带 functionKey=script.patch 劫持本轮。
    const textarea = screen.getByLabelText("我能帮你做什么");
    await user.type(textarea, "请不要局部修改了，生成一份完整稿子。");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    const resolver = initialChatTransport?.body;
    expect(typeof resolver).toBe("function");
    const requestBody = await (
      resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
    )();
    expect(requestBody).toMatchObject({
      chatContext: {
        selection: {
          kind: "script_section",
          artifactId: "artifact-1",
          versionId: "version-8",
        },
      },
    });
    expect(
      (requestBody.chatContext as Record<string, unknown>).functionKey,
    ).toBeUndefined();

    mockMessages = [
      ...mockMessages,
      {
        id: "u2",
        role: "user",
        parts: [{ type: "text", text: "请不要局部修改了，生成一份完整稿子。" }],
      },
      {
        id: "a2",
        role: "assistant",
        parts: [
          {
            type: "tool-script_draft",
            state: "output-available",
            input: { topic: "完整稿" },
            output: { kind: "script.draft", taskId: "task-draft-1" },
          },
        ],
      },
    ];
    rerender(<AICopilotContent viewModel={VM} embed={embed} />);
    await waitFor(() =>
      expect(
        screen.queryByText(/没有生成可采纳的局部改稿候选/),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="context-chip"][data-kind="script_section"]',
        ),
      ).toBeNull(),
    );
  });

  it("[T-732] 段落锚点失效后退出局部模式，普通消息不再被旧 selection 阻断", async () => {
    const user = userEvent.setup();
    const embedBase = {
      surface: "project",
      selection: { kind: "project", id: "proj-1", title: "我的作品" },
      persistKey: "project:proj-1",
    } as const;
    const staleRequest = {
      functionKey: "script.patch",
      prefill: "请只改写我选中的这一段。",
      selection: {
        kind: "script_section",
        id: "section-stale",
        title: "第 2 段",
        artifactId: "artifact-1",
        versionId: "version-old",
        sectionIndex: 1,
        excerpt: "已经不在当前版本的段落",
      },
      nonce: 1,
    } as const;
    const { rerender } = render(
      <AICopilotContent
        viewModel={VM}
        embed={{ ...embedBase, request: staleRequest }}
      />,
    );

    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    mockMessages = [
      {
        id: "u-stale",
        role: "user",
        parts: [{ type: "text", text: staleRequest.prefill }],
      },
    ];
    mockError = new Error(
      JSON.stringify({
        code: "SCRIPT_SELECTION_STALE",
        error:
          "稿面刚刚切换过版本，这一段已不在当前稿中。请在当前稿面目标段重新点一次“AI 改写本段”。",
      }),
    );
    rerender(
      <AICopilotContent
        viewModel={VM}
        embed={{ ...embedBase, request: staleRequest }}
      />,
    );

    expect(await screen.findByText(/本次局部改写已结束/)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="context-chip"][data-kind="script_section"]',
        ),
      ).toBeNull(),
    );
    expect(document.querySelector('[data-slot="copilot-error-retry"]')).toBeNull();

    const resolver = initialChatTransport?.body;
    expect(typeof resolver).toBe("function");
    expect(
      await (
        resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
      )(),
    ).toMatchObject({
      chatContext: {
        surface: "project",
        projectId: "proj-1",
        selection: {
          kind: "project",
          ids: ["proj-1"],
        },
      },
    });

    // 不先替测试组件清掉 error：真实用户就是在刚看到该终态错误时直接继续提问。
    // 普通发送必须自己越过已结束的局部模式，不能依赖 provider 先恢复空错误态。
    const textarea = screen.getByLabelText("我能帮你做什么");
    await user.type(textarea, "什么原因？先回答我这个问题。");
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    expect(sendMessage).toHaveBeenLastCalledWith({
      text: "什么原因？先回答我这个问题。",
    });
    const ordinaryBody = await (
      resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
    )();
    expect(ordinaryBody).not.toMatchObject({
      chatContext: {
        functionKey: "script.patch",
        selection: { kind: "script_section" },
      },
    });

    mockError = null;
    const currentRequest = {
      ...staleRequest,
      nonce: 2,
      selection: {
        ...staleRequest.selection,
        id: "section-current",
        versionId: "version-current",
        excerpt: "当前版本的第 2 段",
      },
    } as const;
    rerender(
      <AICopilotContent
        viewModel={VM}
        embed={{ ...embedBase, request: currentRequest }}
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector(
          '[data-slot="context-chip"][data-kind="script_section"]',
        ),
      ).not.toBeNull(),
    );
    await user.click(screen.getByLabelText("提交提示给 Copilot"));
    expect(sendMessage).toHaveBeenLastCalledWith({
      text: currentRequest.prefill,
    });
    expect(
      await (
        resolver as () => Promise<Record<string, unknown>> | Record<string, unknown>
      )(),
    ).toMatchObject({
      chatContext: {
        functionKey: "script.patch",
        selection: {
          kind: "script_section",
          ids: ["section-current"],
          versionId: "version-current",
        },
      },
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
    expect(screen.getByText("这次没有生成成功")).toBeInTheDocument();
    expect(screen.getByText("刚才输入的内容还在，可以直接再试一次。")).toBeInTheDocument();
    const retry = document.querySelector(
      '[data-slot="copilot-error-retry"]',
    ) as HTMLButtonElement;
    expect(retry).not.toBeNull();
    await user.click(retry);
    expect(regenerate).toHaveBeenCalledTimes(1);
  });

  it.each(["CHAT_RESULT_UNCONFIRMED", "本次执行结果尚未确认，请在任务中心核对原任务，避免重复操作。"])("[T-957] 原任务结果未知时不显示重新提交按钮：%s", (message) => {
    mockError = new Error(message);
    mockMessages = [{ id: "u1", role: "user", parts: [{ type: "text", text: "复盘当前作品" }] }];
    render(<AICopilotContent viewModel={VM} />);
    expect(screen.getByText("本轮对话已停止")).toBeInTheDocument();
    expect(screen.getByText(/外部操作未返回确认结果/)).toBeInTheDocument();
    expect(document.querySelector('[data-slot="copilot-error-retry"]')).toBeNull();
    expect(screen.queryByText("刚才输入的内容还在，可以直接再试一次。")).not.toBeInTheDocument();
    expect(regenerate).not.toHaveBeenCalled();
  });

  it("[T-913] 模型未配置 → 直接打开模型设置，不再显示泛化重试", () => {
    mockError = new Error("LlmCredentialError: 无可用 LLM 凭据");
    mockMessages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "帮我生成一版" }] },
    ];
    render(<AICopilotContent viewModel={VM} />);

    expect(screen.getByText("完成 AI 设置后继续")).toBeInTheDocument();
    expect(screen.getByText("刚才输入的内容已经保留。完成设置后，回来即可继续。")).toBeInTheDocument();
    const settings = document.querySelector(
      '[data-slot="copilot-error-settings-link"]',
    ) as HTMLAnchorElement;
    expect(settings).not.toBeNull();
    expect(settings.getAttribute("href")).toBe("/settings?highlight=text-model");
    expect(settings.textContent).toContain("去设置 AI 模型");
    expect(document.querySelector('[data-slot="copilot-error-retry"]')).toBeNull();
  });

  it("[T-913] 定位未完成 → 直达定位中心，不误导去模型设置", () => {
    mockError = new Error("POSITIONING_MISSING");
    mockMessages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "基于我的定位出题" }] },
    ];
    render(<AICopilotContent viewModel={VM} />);

    expect(screen.getByText("先完成账号定位")).toBeInTheDocument();
    expect(screen.getByText("刚才输入的内容已经保留。保存一版定位后，回来即可继续。")).toBeInTheDocument();
    const positioning = document.querySelector(
      '[data-slot="copilot-error-positioning-link"]',
    ) as HTMLAnchorElement;
    expect(positioning).not.toBeNull();
    expect(positioning.getAttribute("href")).toBe("/positioning");
    expect(document.querySelector('[data-slot="copilot-error-settings-link"]')).toBeNull();
    expect(document.querySelector('[data-slot="copilot-error-retry"]')).toBeNull();
  });

  it("[T-715] 受管额度不足 → 显示充值入口，不显示模型设置或无意义重试", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          openUrl: "https://growth.example/credits/launch#PORTAL_CODE_123",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const user = userEvent.setup();
    mockError = new Error("AI 额度不足，请充值后再试。");
    mockMessages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "生成文案" }] },
    ];
    render(<AICopilotContent viewModel={VM} />);

    expect(screen.getByText("AI 额度需要补充")).toBeInTheDocument();
    expect(screen.getByText("刚才输入的内容已经保留。补充额度后，回来即可继续。")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="copilot-error-settings-link"]')).toBeNull();
    expect(document.querySelector('[data-slot="copilot-error-retry"]')).toBeNull();
    const recharge = screen.getByRole("button", { name: "查看额度并充值" });
    await user.click(recharge);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/local/ai-credits/connect",
        { method: "POST", headers: {} },
      ),
    );
    await waitFor(() =>
      expect(openExternalUrl).toHaveBeenCalledWith(
        "https://growth.example/credits/launch#PORTAL_CODE_123",
      ),
    );
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
      // [T-474] 下拉必须浮在 Copilot 输入卡之上。通用 Card 默认 overflow-hidden，
      // 若 composer 不显式放开溢出，bottom-full 的候选即使 z-index 再高也会被裁掉。
      const composer = document.querySelector('[data-slot="prompt-composer"]');
      expect(composer?.className).toContain("overflow-visible");
      expect(menu.className).toContain("z-50");
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

    it("选中某项目 → @query 不进消息正文 + 显式项目引用标签保留完整 ID/标题", async () => {
      const user = userEvent.setup();
      listProjects.mockResolvedValue([{ id: "proj-1", title: "上下文工程" }]);
      render(<AICopilotContent viewModel={VM} />);
      const textarea = screen.getByLabelText("我能帮你做什么") as HTMLTextAreaElement;

      await user.type(textarea, "@上下");
      await waitFor(() => expect(listProjects).toHaveBeenCalled());
      const option = await screen.findByRole("option", { name: /上下文工程/ });
      await user.click(option);

      // @ 只负责选择上下文，完整标题不再塞进 textarea / 用户消息。
      await waitFor(() => {
        expect(textarea.value).not.toContain("@上下");
        expect(textarea.value).not.toContain("上下文工程");
      });
      // 显式的项目引用 chip 出现(带 projectId),= 本次对话已注入该项目的可见凭证。
      const chip = document.querySelector(
        '[data-slot="context-chip"][data-kind="project"][data-project-id="proj-1"]',
      );
      expect(chip).not.toBeNull();
      expect(chip!.textContent).toContain("项目·上下文工程");
      expect(chip!.getAttribute("title")).toBe("项目 · 上下文工程");
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

  // [T-239g] 长任务完成 → 对话内通知卡(SPEC §2-S7)。轮询 ai.tasks.list 检出「新到终态」的
  // 任务 → 推轻通知。本用例用「流式结束刷新」这条确定性通路驱动第二次 fetch(轮询同 refresh
  // 路径,pure diff 逻辑另在 task-notifications.test.ts 全量覆盖)。
  describe("[T-239g] 长任务完成对话内通知卡", () => {
    const wireTask = (over: Record<string, unknown>) => ({
      id: "t1",
      projectId: null,
      taskType: "script.draft",
      status: "running",
      requestedAt: "2026-07-11T00:00:00.000Z",
      errorMessage: null,
      ...over,
    });

    // ready → streaming → ready 触发组件的「流式结束刷新 feed」,拿到本次 listTasks 的新结果。
    async function driveStreamingEnd(rerender: (ui: React.ReactElement) => void) {
      mockStatus = "streaming";
      rerender(<AICopilotContent viewModel={VM} />);
      mockStatus = "ready";
      rerender(<AICopilotContent viewModel={VM} />);
    }

    it("[T-976] 聊天未知结果不变成后台核对通知，其他创作任务仍可通知", async () => {
      listTasks.mockResolvedValue([
        wireTask({ id: "chat-turn", taskType: "copilot.assist", inputData: { kind: "chat.run" }, executionTaskId: "chat-exec", runtimeStatus: "unknown_result" }),
        wireTask({ id: "draft", status: "running" }),
      ]);
      const { rerender } = render(<AICopilotContent viewModel={VM} />);
      await waitFor(() => expect(listTasks).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(document.querySelector('[data-task-id="chat-turn"]')).toBeNull();
      expect(screen.queryByText("刷新状态")).not.toBeInTheDocument();

      listTasks.mockResolvedValue([
        wireTask({ id: "chat-turn", taskType: "copilot.assist", inputData: { kind: "chat.run" }, executionTaskId: "chat-exec", status: "failed" }),
        wireTask({ id: "draft", status: "succeeded" }),
      ]);
      await driveStreamingEnd(rerender);
      await waitFor(() => expect(document.querySelector('[data-slot="task-notification"][data-task-id="draft"]')).not.toBeNull());
      expect(document.querySelector('[data-task-id="chat-turn"]')).toBeNull();
    });

    it("首帧已是终态的历史任务不推通知(只播种)", async () => {
      listTasks.mockResolvedValue([wireTask({ status: "succeeded" })]);
      render(<AICopilotContent viewModel={VM} />);
      // [T-354] 次区任务 feed 已下架,等待锚改为「首轮 listTasks 已发 + flush」——播种逻辑
      // 本体保留(喂通知卡),首帧终态只播种、不该推任何通知卡。
      await waitFor(() =>
        expect(listTasks).toHaveBeenCalled(),
      );
      await new Promise((r) => setTimeout(r, 0));
      expect(
        document.querySelector('[data-slot="task-notification"]'),
      ).toBeNull();
    });

    it("在途任务跑完 → 推 succeeded 通知卡,点 × 可关闭", async () => {
      const user = userEvent.setup();
      // 首帧:running(播种快照,不通知)。[T-354] 次区 feed 已下架,等待锚改为
      // 「首轮 listTasks 已发 + flush」(播种逻辑本体保留,喂通知卡)。
      listTasks.mockResolvedValue([wireTask({ status: "running" })]);
      const { rerender } = render(<AICopilotContent viewModel={VM} />);
      await waitFor(() => expect(listTasks).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(
        document.querySelector('[data-slot="task-notification"]'),
      ).toBeNull();

      // 任务转 succeeded + 触发一轮流式结束刷新 → 检出迁移 → 推通知。
      listTasks.mockResolvedValue([wireTask({ status: "succeeded" })]);
      await driveStreamingEnd(rerender);

      const card = await waitFor(() => {
        const el = document.querySelector(
          '[data-slot="task-notification"][data-task-id="t1"]',
        );
        expect(el).not.toBeNull();
        return el as HTMLElement;
      });
      expect(card.getAttribute("data-status")).toBe("succeeded");
      expect(card.textContent).toContain("脚本初稿");
      expect(card.textContent).toContain("已完成");

      // 关闭 → 通知移除。
      await user.click(
        card.querySelector(
          '[data-slot="task-notification-dismiss"]',
        ) as HTMLButtonElement,
      );
      await waitFor(() =>
        expect(
          document.querySelector('[data-slot="task-notification"][data-task-id="t1"]'),
        ).toBeNull(),
      );
    });

    it("失败任务 → 通知诚实带原因", async () => {
      listTasks.mockResolvedValue([wireTask({ status: "running" })]);
      const { rerender } = render(<AICopilotContent viewModel={VM} />);
      // [T-354] 次区 feed 已下架,等待锚改为「首轮 listTasks 已发 + flush」(播种)。
      await waitFor(() => expect(listTasks).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));

      listTasks.mockResolvedValue([
        wireTask({ status: "failed", errorMessage: "渲染器超时,请重试" }),
      ]);
      await driveStreamingEnd(rerender);

      const detail = await waitFor(() => {
        const el = document.querySelector(
          '[data-slot="task-notification"][data-task-id="t1"] [data-slot="task-notification-detail"]',
        );
        expect(el).not.toBeNull();
        return el as HTMLElement;
      });
      expect(detail.textContent).toContain("渲染器超时");
    });
  });
});

it.each(["output-error","output-denied","approval-responded"])("失败或拒绝工具 %s 显示终态，历史回放不永久转圈",state=>{
  mockMessages=[{id:"terminal-tool",role:"assistant",parts:[{type:"tool-web_read",toolCallId:"read-terminal",state,...(state==="output-error"?{rawInput:'{"query":',errorText:"工具参数无效"}:{input:{query:"测试"},approval:{id:"receipt:tool",approved:false}})}]}];
  const {container}=render(<AICopilotContent viewModel={VM} />);
  expect(container.querySelector('[data-slot="copilot-tool-running"]')).toBeNull();
  expect(screen.getByText(state==="output-error"?/工具参数无效/:/已拒绝/)).toBeInTheDocument();
  expect(sendMessage).not.toHaveBeenCalled();
});
