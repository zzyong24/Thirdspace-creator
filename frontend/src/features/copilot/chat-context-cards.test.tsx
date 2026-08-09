import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

// [T-098] context.* 数据渲染卡:真数据直渲、前 8 条 + 展开全部、分页真相、诚实空态
// (SPEC context-layer-redesign §2.3 卡的展示义务)。

import {
  CONTEXT_CARD_VISIBLE,
  ChatCommentListCard,
  ChatContextGenericCard,
  ChatKnowledgeListCard,
  ChatProjectLifecycleCard,
  ChatProjectListCard,
  ChatReviewContextCard,
} from "./chat-context-cards";

afterEach(() => cleanup());

const projects = Array.from({ length: 10 }, (_, i) => ({
  id: `p${i}`,
  title: `真实作品标题 ${i}`,
  stage: "planning",
  status: "active",
  publishedAt: null,
}));

describe("ChatProjectListCard", () => {
  it("默认渲前 8 条 + 「展开全部 10 条」;点开渲全量(同一份真值,不二次请求)", async () => {
    const user = userEvent.setup();
    render(<ChatProjectListCard items={projects} total={25} hasMore={true} />);
    expect(screen.getAllByText(/真实作品标题/)).toHaveLength(
      CONTEXT_CARD_VISIBLE,
    );
    expect(screen.getByText("真实作品标题 0")).toBeTruthy();
    expect(screen.queryByText("真实作品标题 9")).toBeNull();

    await user.click(screen.getByText("展开全部 10 条"));
    expect(screen.getAllByText(/真实作品标题/)).toHaveLength(10);
    expect(screen.getByText("真实作品标题 9")).toBeTruthy();
  });

  it("分页真相:本卡条数 + 库中总量 + hasMore 如实标注还有未拉取", () => {
    render(<ChatProjectListCard items={projects} total={25} hasMore={true} />);
    expect(screen.getByText(/本卡 10 条 · 库中共 25 条/)).toBeTruthy();
    expect(screen.getByText(/还有未拉取的/)).toBeTruthy();
  });

  it("空结果 → 诚实空态,不渲假行", () => {
    render(<ChatProjectListCard items={[]} total={0} hasMore={false} />);
    expect(screen.getByText(/项目库还是空的/)).toBeTruthy();
  });
});

describe("[T-691] ChatProjectLifecycleCard", () => {
  it("分区失败明确显示读取失败，不伪装成用户没有内容", () => {
    render(
      <ChatProjectLifecycleCard
        lifecycle={{
          traceId: "lifecycle-trace-1",
          project: {
            id: "p1",
            title: "真实项目",
            stage: "script",
            status: "active",
            source: "manual",
            publishedAt: null,
          },
          brief: {},
          artifacts: [],
          materials: [],
          cover: null,
          publications: [],
          metrics: { subject: "真实项目", rows: [], retention: [] },
          review: null,
          retrospective: { learningCount: 0 },
          completeness: {
            brief: "empty",
            artifacts: "error",
            materials: "empty",
          },
          errors: [{ section: "artifacts", code: "ARTIFACTS_DATABASE_ERROR" }],
        }}
      />,
    );

    expect(screen.getByText("项目全流程 · 真实项目")).toBeTruthy();
    expect(screen.getByText("读取失败")).toBeTruthy();
    expect(screen.getByText(/这不代表用户没有内容/)).toBeTruthy();
    expect(screen.getByText(/lifecycle-trace-1/)).toBeTruthy();
  });
});

describe("[T-691] ChatReviewContextCard", () => {
  it("旧版报告明确提示已过期，并展示真实建议", () => {
    render(
      <ChatReviewContextCard
        report={{
          id: "report-1",
          projectId: "p1",
          artifactId: "artifact-1",
          artifactVersion: 2,
          artifactVersionId: "version-2",
          verdict: "needs_changes",
          summary: "需要调整",
          modelLabel: "通用模型",
          reviewedAt: "2026-08-04T00:00:00.000Z",
          stale: true,
          findings: [
            {
              findingId: "finding-1",
              level: "L2",
              quote: "原句",
              start: 0,
              end: 2,
              category: "表达",
              reason: "表达不够自然",
              suggestion: "改成更自然的口语",
              applicable: true,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText(/这份报告只代表旧版本/)).toBeTruthy();
    expect(screen.getByText(/表达不够自然/)).toBeTruthy();
    expect(screen.getByText(/改成更自然的口语/)).toBeTruthy();
  });
});

describe("ChatCommentListCard", () => {
  it("评论原文直渲(真值),带点赞/来源/时间", () => {
    render(
      <ChatCommentListCard
        items={[
          {
            text: "这条讲得太好了,求下期",
            likeCount: 12,
            source: "douyin",
            createdAt: "2026-06-30T08:00:00Z",
          },
        ]}
        total={1}
        hasMore={false}
      />,
    );
    expect(screen.getByText("这条讲得太好了,求下期")).toBeTruthy();
    expect(screen.getByText(/👍 12/)).toBeTruthy();
  });
});

describe("ChatKnowledgeListCard", () => {
  it("标题 + 片段直渲;超过 8 条给展开", async () => {
    const user = userEvent.setup();
    const items = Array.from({ length: 9 }, (_, i) => ({
      id: `k${i}`,
      title: `知识条目 ${i}`,
      snippet: `片段 ${i}`,
    }));
    render(<ChatKnowledgeListCard items={items} />);
    expect(screen.getAllByText(/知识条目/)).toHaveLength(CONTEXT_CARD_VISIBLE);
    await user.click(screen.getByText("展开全部 9 条"));
    expect(screen.getAllByText(/知识条目/)).toHaveLength(9);
  });

  it("空命中 → 诚实空态", () => {
    render(<ChatKnowledgeListCard items={[]} />);
    expect(screen.getByText(/知识库没搜到匹配的条目/)).toBeTruthy();
  });
});

describe("ChatContextGenericCard(未知 kind 兜底)", () => {
  it("items 数组 → 自动列表格(列 = 键并集,真值单元格)", () => {
    render(
      <ChatContextGenericCard
        kind="context.future"
        out={{
          kind: "context.future",
          items: [
            { name: "甲", views: 100 },
            { name: "乙", views: 200 },
          ],
          total: 2,
          hasMore: false,
        }}
      />,
    );
    expect(screen.getByText("name")).toBeTruthy();
    expect(screen.getByText("甲")).toBeTruthy();
    expect(screen.getByText("200")).toBeTruthy();
    // 顶层标量(分页真相)以键值行如实显示。
    expect(screen.getByText(/total: 2/)).toBeTruthy();
  });
});
