/**
 * KnowledgeCommentBackflow 交互测试(T-092 三级去噪门 ③确认门)。mock 回流调用
 * (fetch /api/knowledge/comment-sift)与 contract client,覆盖:
 *  - signals 0 行 → 诚实空态(引导去复盘页采集),无假候选;
 *  - 候选门:默认全选,title/note 可改;采纳选中 N 条 → 逐条 knowledge.create
 *    (knowledgeType='qa'、sourceType='import'、sourceMetadata 双料锚)+ refresh;
 *  - 未勾选的不落库;
 *  - service 幂等命中(已回流)→ 该行标「已入库」不整批失败;
 *  - 预筛后 0 候选 → 诚实文案(全是水/已回流),不编候选。
 */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRouter = { refresh: vi.fn(), replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const createKnowledge = vi.fn((_input: unknown): Promise<unknown> =>
  Promise.resolve({ id: "k-new" }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createKnowledge: (input: unknown) => createKnowledge(input as never),
  },
}));

import { KnowledgeCommentBackflow } from "./knowledge-comment-backflow";
import { CURRENT_ACCOUNT_KEY } from "@/lib/http-transport";

const fetchMock = vi.fn();

beforeEach(() => {
  mockRouter.refresh.mockClear();
  createKnowledge.mockReset();
  createKnowledge.mockResolvedValue({ id: "k-new" });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function siftResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const CANDIDATES = [
  {
    title: "怎么在本地跑大模型?",
    note: "",
    sourceNote: "抖音评论 ×2,最高赞 57",
    signalIds: ["sig-1", "sig-2"],
    signalExternalIds: ["douyin:comment:c1", "douyin:comment:c2"],
    supportingComments: [
      { id: "sig-1", rawText: "本地模型怎么装?", likeCount: 57 },
      { id: "sig-2", rawText: "求本地部署教程", likeCount: 31 },
    ],
  },
  {
    title: "显存不够能跑吗?",
    note: "",
    sourceNote: "抖音评论,赞 3",
    signalIds: ["sig-3"],
    signalExternalIds: ["douyin:comment:c3"],
    supportingComments: [{ id: "sig-3", rawText: "显存不够能跑吗", likeCount: 3 }],
  },
];

describe("KnowledgeCommentBackflow", () => {
  it("signals 0 行 → 诚实空态 + 复盘采集引导(无假候选)", async () => {
    window.localStorage.setItem(CURRENT_ACCOUNT_KEY, "acct-comments");
    fetchMock.mockResolvedValue(
      siftResponse({
        signalsTotal: 0,
        prefiltered: 0,
        droppedNoise: 0,
        droppedBackflowed: 0,
        candidates: [],
      }),
    );
    const { getByText, container } = render(<KnowledgeCommentBackflow />);
    fireEvent.click(getByText("评论回流"));
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="knowledge-comment-backflow-empty"]'),
      ).not.toBeNull();
    });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get("x-account-id")).toBe(
      "acct-comments",
    );
    expect(getByText("还没有采集到评论")).toBeTruthy();
    expect(
      container.querySelector('[data-slot="knowledge-qa-candidate"]'),
    ).toBeNull();
  });

  it("预筛后 0 候选 → 诚实文案(不编候选)", async () => {
    fetchMock.mockResolvedValue(
      siftResponse({
        signalsTotal: 7,
        prefiltered: 0,
        droppedNoise: 5,
        droppedBackflowed: 2,
        candidates: [],
      }),
    );
    const { getByText, container } = render(<KnowledgeCommentBackflow />);
    fireEvent.click(getByText("评论回流"));
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="knowledge-comment-backflow-none"]'),
      ).not.toBeNull();
    });
  });

  it("确认门:采纳选中 → 逐条 knowledge.create(qa + import + 双料锚)+ refresh;未勾选不落库", async () => {
    fetchMock.mockResolvedValue(
      siftResponse({
        signalsTotal: 10,
        prefiltered: 5,
        droppedNoise: 3,
        droppedBackflowed: 2,
        candidates: CANDIDATES,
      }),
    );
    const { getByText, container } = render(<KnowledgeCommentBackflow />);
    fireEvent.click(getByText("评论回流"));
    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-slot="knowledge-qa-candidate"]'),
      ).toHaveLength(2);
    });
    // 取消第二条 → 只采纳 1 条。
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      '[data-slot="knowledge-qa-select"]',
    );
    fireEvent.click(checkboxes[1]!);
    fireEvent.click(getByText("采纳选中 1 条"));
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(createKnowledge).toHaveBeenCalledTimes(1);
    expect(createKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "怎么在本地跑大模型?",
          knowledgeType: "qa",
          sourceType: "import",
          sourceNote: "抖音评论 ×2,最高赞 57",
          sourceMetadata: {
            origin: "comment_backflow",
            signalIds: ["sig-1", "sig-2"],
            signalExternalIds: ["douyin:comment:c1", "douyin:comment:c2"],
          },
        }),
      }),
    );
  });

  it("service 幂等命中(已回流)→ 该行标「已入库」,其余照常入库", async () => {
    fetchMock.mockResolvedValue(
      siftResponse({
        signalsTotal: 10,
        prefiltered: 5,
        droppedNoise: 3,
        droppedBackflowed: 0,
        candidates: CANDIDATES,
      }),
    );
    createKnowledge
      .mockRejectedValueOnce(new Error("评论已回流过知识库(锚 douyin:comment:c1),不重复入库"))
      .mockResolvedValueOnce({ id: "k-2" });
    const { getByText, container } = render(<KnowledgeCommentBackflow />);
    fireEvent.click(getByText("评论回流"));
    await waitFor(() => {
      expect(
        container.querySelectorAll('[data-slot="knowledge-qa-candidate"]'),
      ).toHaveLength(2);
    });
    fireEvent.click(getByText("采纳选中 2 条"));
    // 第一条 409 标已入库跳过,第二条成功 → refresh 仍发生。
    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    expect(createKnowledge).toHaveBeenCalledTimes(2);
  });
});
