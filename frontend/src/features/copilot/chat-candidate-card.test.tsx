import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 对话内 generative UI 单测(SPEC §3.4)—— AI 工具结果(候选)渲卡 + 逐条采纳走 confirm 门
// (candidates.create);AI 不直接写实体(铁律②)。

const createCandidate = vi.fn();
const patchCandidate = vi.fn();
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createCandidate: (...a: unknown[]) => createCandidate(...a),
    patchCandidate: (...a: unknown[]) => patchCandidate(...a),
  },
}));

import { ChatCandidateCard } from "./chat-candidate-card";

afterEach(() => cleanup());
beforeEach(() => {
  createCandidate.mockReset();
  createCandidate.mockResolvedValue({ id: "cand-1" });
  patchCandidate.mockReset();
  patchCandidate.mockResolvedValue({ id: "cand-scoped" });
  routerRefresh.mockReset();
});

const CANDIDATES = [
  {
    title: "反直觉开头对你有效",
    angle: "用数据打破直觉",
    contentRole: "traffic",
    source: "demand", // [T-149] AI 出题渠道(评论依据)→ 采纳应落 demand,非 idea。
    predictedScore: 82,
    reason: "评论反复问",
  },
  {
    title: "第二条",
    angle: "",
    contentRole: "unknown-role",
    // 无 source(旧工具结果兼容)→ 采纳兜底 idea。
    predictedScore: null,
    reason: "",
  },
];

describe("ChatCandidateCard", () => {
  it("空候选 → 不渲染", () => {
    const { container } = render(<ChatCandidateCard candidates={[]} />);
    expect(
      container.querySelector('[data-slot="chat-candidate-card"]'),
    ).toBeNull();
  });

  it("渲染每条候选(标题/切入/理由/潜力)", () => {
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    expect(screen.getByText("反直觉开头对你有效")).not.toBeNull();
    expect(screen.getByText("切入：用数据打破直觉")).not.toBeNull();
    expect(screen.getByText("评论反复问")).not.toBeNull();
    expect(screen.getByText("潜力 82")).not.toBeNull();
    expect(screen.getByText("第二条")).not.toBeNull();
  });

  it("[T-149] 采纳一条 AI 出题 → candidates.create 透传 AI 渠道 source(非 idea)+ 归一化 contentRole,并 router.refresh", async () => {
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    const adoptButtons = screen.getAllByText("采纳");
    await user.click(adoptButtons[0]);
    await waitFor(() => {
      expect(createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            title: "反直觉开头对你有效",
            angle: "用数据打破直觉",
            source: "demand", // 保住 AI 出题 provenance,不冲进「手动灵感」统计(T-149)。
            contentRole: "traffic",
          },
        }),
      );
    });
    expect(routerRefresh).toHaveBeenCalled();
    // 采纳后该条显示已入池。
    await waitFor(() => {
      expect(screen.getByText("✓ 已入候选池")).not.toBeNull();
    });
  });

  it("[T-149] source 缺省/非法(旧结果 或 模型自由输出)→ 采纳兜底 idea(无「定位/知识库」桶)", async () => {
    const user = userEvent.setup();
    render(
      <ChatCandidateCard
        candidates={[
          { ...CANDIDATES[0], title: "无 source", source: undefined },
          { ...CANDIDATES[0], title: "非法 source", source: "positioning" },
        ]}
      />,
    );
    const adoptButtons = screen.getAllByText("采纳");
    await user.click(adoptButtons[0]); // 无 source
    await waitFor(() => expect(createCandidate).toHaveBeenCalledTimes(1));
    expect(createCandidate.mock.calls[0][0].body.source).toBe("idea");
    await user.click(adoptButtons[1]); // 非法 source
    await waitFor(() => expect(createCandidate).toHaveBeenCalledTimes(2));
    expect(createCandidate.mock.calls[1][0].body.source).toBe("idea");
  });

  it("未知 contentRole 不透给 create(让 backend 用缺省)", async () => {
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    const adoptButtons = screen.getAllByText("采纳");
    await user.click(adoptButtons[1]); // 第二条 contentRole=unknown-role
    await waitFor(() => {
      expect(createCandidate).toHaveBeenCalled();
    });
    const body = createCandidate.mock.calls[0][0].body;
    expect(body.title).toBe("第二条");
    expect(body).not.toHaveProperty("contentRole");
    expect(body.source).toBe("idea");
  });

  it("[T-066] sourceComments 非空 → 渲「依据评论」折叠区,逐条贴原文", () => {
    const { container } = render(
      <ChatCandidateCard
        candidates={[
          {
            ...CANDIDATES[0],
            sourceComments: ["博主,反直觉开头到底怎么写?", "求一期开头教学"],
          },
        ]}
      />,
    );
    const details = container.querySelector(
      '[data-slot="topic-source-comments"]',
    );
    expect(details).not.toBeNull();
    expect(screen.getByText("依据评论（2 条原文）")).not.toBeNull();
    const items = container.querySelectorAll(
      '[data-slot="topic-source-comment-item"]',
    );
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("博主,反直觉开头到底怎么写?");
    expect(items[1].textContent).toContain("求一期开头教学");
  });

  it("[T-066] sourceComments 空/缺省 → 不渲「依据评论」区(旧结果兼容)", () => {
    const { container } = render(
      <ChatCandidateCard
        candidates={[
          { ...CANDIDATES[0], sourceComments: [] },
          CANDIDATES[1], // 无 sourceComments 字段
        ]}
      />,
    );
    expect(
      container.querySelector('[data-slot="topic-source-comments"]'),
    ).toBeNull();
  });

  it("create 失败 → 显示采纳失败(诚实,不假成功)", async () => {
    createCandidate.mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={[CANDIDATES[0]]} />);
    await user.click(screen.getByText("采纳"));
    await waitFor(() => {
      expect(screen.getByText("采纳失败，重试")).not.toBeNull();
    });
  });

  // ── [T-267①] 会话 scoped 到某候选 → 采纳默认「更新当前」(patch),另给「另存为新」(create) ──
  it("[T-267①] scoped 到某候选:点「更新当前」→ patchCandidate 就地改(非新建),并 refresh", async () => {
    const user = userEvent.setup();
    render(
      <ChatCandidateCard
        candidates={[CANDIDATES[0]]}
        selKind="candidate"
        selId="cand-scoped"
      />,
    );
    await user.click(screen.getByText("更新当前"));
    await waitFor(() => {
      expect(patchCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { candidateId: "cand-scoped" },
          body: expect.objectContaining({
            title: "反直觉开头对你有效",
            angle: "用数据打破直觉",
            contentRole: "traffic",
          }),
        }),
      );
    });
    // 不新建(治「在某选题对话里采纳却新建一条」)。
    expect(createCandidate).not.toHaveBeenCalled();
    expect(routerRefresh).toHaveBeenCalled();
    expect(screen.getByText("✓ 已更新当前选题")).not.toBeNull();
  });

  it("[T-267①] scoped 下点「另存为新」→ createCandidate 新建(不动当前)", async () => {
    const user = userEvent.setup();
    render(
      <ChatCandidateCard
        candidates={[CANDIDATES[0]]}
        selKind="candidate"
        selId="cand-scoped"
      />,
    );
    await user.click(screen.getByText("另存为新"));
    await waitFor(() => expect(createCandidate).toHaveBeenCalledTimes(1));
    expect(patchCandidate).not.toHaveBeenCalled();
  });

  it("[T-267①] 未 scoped(selKind≠candidate)→ 仍逐条「采纳」新建(原行为,无「更新当前」)", () => {
    render(<ChatCandidateCard candidates={[CANDIDATES[0]]} selKind="project" selId="p-1" />);
    expect(screen.queryByText("更新当前")).toBeNull();
    expect(screen.getByText("采纳")).not.toBeNull();
  });

  // ── [T-264] 批量入库:采纳选中 N 条 → 逐条 create,只一次 refresh ──
  it("[T-264] ≥2 条渲批量门;「采纳选中 N 条」逐条 create 但只 router.refresh 一次", async () => {
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    // 默认全选 → 批量按钮显 2 条。
    const batchBtn = screen.getByText("采纳选中 2 条");
    await user.click(batchBtn);
    await waitFor(() => expect(createCandidate).toHaveBeenCalledTimes(2));
    // 关键:批量只刷新一次(而非逐条 N 次)。
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("[T-264] 取消勾选一条 → 批量按钮条数跟着变,未选中的不入库", async () => {
    const user = userEvent.setup();
    render(<ChatCandidateCard candidates={CANDIDATES} />);
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]); // 取消第 1 条
    expect(screen.getByText("采纳选中 1 条")).not.toBeNull();
    await user.click(screen.getByText("采纳选中 1 条"));
    await waitFor(() => expect(createCandidate).toHaveBeenCalledTimes(1));
    // 只入了第 2 条(未取消的那条)。
    expect(createCandidate.mock.calls[0][0].body.title).toBe("第二条");
  });

  it("[T-264] 单条候选 → 不渲批量门(无意义)", () => {
    render(<ChatCandidateCard candidates={[CANDIDATES[0]]} />);
    expect(
      document.querySelector('[data-slot="chat-candidate-batch"]'),
    ).toBeNull();
  });
});
