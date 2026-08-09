import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const openChat = vi.fn();
const flushSave = vi.fn(async () => undefined);

vi.mock("./draft-chat-request", () => ({
  useDraftChatRequest: () => ({ openChat, flushSave }),
}));

vi.mock("@/lib/contract-client", () => ({
  client: { createOutput: vi.fn() },
}));

import { PublishPackageCta } from "./publish-package-cta";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PublishPackageCta — T-738 发布物料查看闭环", () => {
  it("已有持久化发布物料时显示查看入口，并在原页面打开完整内容", () => {
    render(
      <PublishPackageCta
        projectId="project-1"
        projectTitle="测试项目"
        outputId="output-1"
        publishPack={{
          publicationId: "publication-1",
          platform: "douyin",
          status: "draft",
          publishedAt: null,
          title: "九点还没起床，我让智能体先拍",
          description: "这是已经采纳并持久化的发布正文。",
          tags: ["AI提效", "编导智能体"],
          hasCover: false,
          coverAssetId: null,
        }}
      />,
    );

    expect(screen.queryByText("生成发布物料")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看发布物料" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("九点还没起床");
    expect(dialog.textContent).toContain("已经采纳并持久化的发布正文");
    expect(dialog.textContent).toContain("AI提效");
    expect(dialog.textContent).not.toContain("发布中心");
    expect(openChat).not.toHaveBeenCalled();
  });
});
