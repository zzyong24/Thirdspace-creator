import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// [T-248B②] 受众信号入口单测:
//   ① 打开弹窗才懒拉 audienceSignals.list;渲来源徽标/需求标签/原文。
//   ② 空库 → 诚实空态「还没有受众信号 —— 评论采集与分析跑过后会出现在这里。」。
//   ③ 「转为候选」→ Dialog 双按钮确认门(禁原生 confirm)→ linkSignalToCandidate
//     (body 省略 candidateId = 孵化 demand 候选)→ 行内标记「已转候选」+ onRefresh。
//   ④ 已关联信号只渲「已转候选」徽标,不给转换按钮。
//   ⑤ op 失败 → 行内诚实渲错,不标已转、不刷新。

const listAudienceSignals = vi.fn();
const linkSignalToCandidate = vi.fn();

vi.mock("@/lib/contract-client", () => ({
  client: {
    listAudienceSignals: (...a: unknown[]) => listAudienceSignals(...a),
    linkSignalToCandidate: (...a: unknown[]) => linkSignalToCandidate(...a),
  },
}));

import {
  AudienceSignalsButton,
  signalSourceLabel,
} from "./topics-audience-signals";
import type { AudienceSignalResource } from "@creatoros/backend/modules/candidate";

const ISO = new Date(2026, 6, 11, 9, 30).toISOString();

function signal(
  over: Partial<AudienceSignalResource> = {},
): AudienceSignalResource {
  return {
    id: "sig-1",
    userId: "user-a",
    source: "comment",
    rawText: "能不能出一期讲怎么给短视频起标题的?",
    demandTag: "标题方法",
    payingIntent: null,
    linkedCandidateId: null,
    ingestionRunId: null,
    publicationId: null,
    likeCount: 12,
    externalId: null,
    createdAt: ISO,
    ...over,
  };
}

afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  listAudienceSignals.mockResolvedValue([signal()]);
  linkSignalToCandidate.mockResolvedValue({ id: "cand-new" });
});

describe("signalSourceLabel", () => {
  it("契约枚举 → 中文;未知值诚实回退原串", () => {
    expect(signalSourceLabel("comment")).toBe("评论");
    expect(signalSourceLabel("dm")).toBe("私信");
    expect(signalSourceLabel("consultation")).toBe("咨询");
    expect(signalSourceLabel("review")).toBe("复盘");
    expect(signalSourceLabel("unknown-src")).toBe("unknown-src");
  });
});

describe("AudienceSignalsButton", () => {
  it("打开弹窗 → 懒拉 list → 渲信号行(来源徽标/需求标签/原文)", async () => {
    render(<AudienceSignalsButton />);
    // 未打开前不拉取(供给区首屏零额外请求)
    expect(listAudienceSignals).not.toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("audience-signals-trigger"));
    await waitFor(() =>
      expect(listAudienceSignals).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByTestId("audience-signal-row")).toBeInTheDocument(),
    );
    expect(screen.getByText("评论")).toBeInTheDocument();
    expect(screen.getByText("标题方法")).toBeInTheDocument();
    expect(
      screen.getByText("能不能出一期讲怎么给短视频起标题的?"),
    ).toBeInTheDocument();
  });

  it("空库 → 诚实空态", async () => {
    listAudienceSignals.mockResolvedValueOnce([]);
    render(<AudienceSignalsButton />);
    await userEvent.click(screen.getByTestId("audience-signals-trigger"));
    await waitFor(() =>
      expect(
        screen.getByTestId("audience-signals-empty"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "还没有受众信号 —— 评论采集与分析跑过后会出现在这里。",
      ),
    ).toBeInTheDocument();
  });

  it("转为候选:Dialog 确认 → linkToCandidate(省略 candidateId)→ 已转候选 + onRefresh", async () => {
    const onRefresh = vi.fn();
    render(<AudienceSignalsButton onRefresh={onRefresh} />);
    await userEvent.click(screen.getByTestId("audience-signals-trigger"));
    await waitFor(() =>
      expect(
        screen.getByTestId("audience-signal-link-trigger"),
      ).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("audience-signal-link-trigger"));
    // Dialog 确认门(非原生 confirm)
    expect(
      screen.getByTestId("audience-signal-link-confirm"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByTestId("audience-signal-link-confirm-button"),
    );
    await waitFor(() =>
      expect(linkSignalToCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          params: { signalId: "sig-1" },
          body: {},
        }),
      ),
    );
    // 行内标记已转候选,转换按钮消失
    await waitFor(() =>
      expect(
        screen.getByTestId("audience-signal-linked-badge"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("audience-signal-link-trigger"),
    ).not.toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("确认门点「取消」→ 不调 op、不刷新", async () => {
    const onRefresh = vi.fn();
    render(<AudienceSignalsButton onRefresh={onRefresh} />);
    await userEvent.click(screen.getByTestId("audience-signals-trigger"));
    await waitFor(() =>
      expect(
        screen.getByTestId("audience-signal-link-trigger"),
      ).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("audience-signal-link-trigger"));
    await userEvent.click(screen.getByTestId("audience-signal-link-cancel"));
    expect(linkSignalToCandidate).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("已关联信号:只渲「已转候选」徽标,无转换按钮", async () => {
    listAudienceSignals.mockResolvedValueOnce([
      signal({ linkedCandidateId: "cand-1" }),
    ]);
    render(<AudienceSignalsButton />);
    await userEvent.click(screen.getByTestId("audience-signals-trigger"));
    await waitFor(() =>
      expect(
        screen.getByTestId("audience-signal-linked-badge"),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByTestId("audience-signal-link-trigger"),
    ).not.toBeInTheDocument();
  });

  it("linkToCandidate 失败 → 行内渲错、不标已转、不刷新", async () => {
    linkSignalToCandidate.mockRejectedValueOnce(new Error("boom"));
    const onRefresh = vi.fn();
    render(<AudienceSignalsButton onRefresh={onRefresh} />);
    await userEvent.click(screen.getByTestId("audience-signals-trigger"));
    await waitFor(() =>
      expect(
        screen.getByTestId("audience-signal-link-trigger"),
      ).toBeInTheDocument(),
    );
    await userEvent.click(screen.getByTestId("audience-signal-link-trigger"));
    await userEvent.click(
      screen.getByTestId("audience-signal-link-confirm-button"),
    );
    await waitFor(() =>
      expect(
        screen.getByTestId("audience-signal-error"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("转为候选失败，请稍后重试。")).toBeInTheDocument();
    expect(
      screen.queryByTestId("audience-signal-linked-badge"),
    ).not.toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
