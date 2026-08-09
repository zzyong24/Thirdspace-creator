import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const openChat = vi.fn();
const createArtifactVersion = vi.fn(async (_input: unknown) => ({ id: "version-next" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({
  client: {
    createArtifactVersion: (input: unknown) => createArtifactVersion(input),
  },
}));
vi.mock("./draft-chat-request", () => ({
  useDraftChatRequest: () => ({ openChat }),
}));

import { ThesisSkeletonPanel } from "./thesis-skeleton-panel";
import type { ThesisSkeleton } from "@/features/script/script-editor-data";

const NODES = [
  {
    column: "core" as const,
    title: "核心观点",
    summary: "先说清为什么",
    materialRefs: [],
  },
];

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("T-730 可选论点骨架", () => {
  it("空态明确说明适用与可跳过场景，两个动作都真实可用", () => {
    const scrollIntoView = vi.fn();
    const script = document.createElement("section");
    script.id = "script";
    script.tabIndex = -1;
    script.scrollIntoView = scrollIntoView;
    document.body.appendChild(script);

    render(<ThesisSkeletonPanel thesis={null} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    expect(within(panel).getByText(/知识讲解、观点评论、测评对比/)).toBeInTheDocument();
    expect(within(panel).getByText(/已有完整逐字稿、简单通知、短口播/)).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole("button", { name: "先梳理观点" }));
    expect(openChat).toHaveBeenCalledWith(
      expect.objectContaining({ functionKey: "planning.thesis", autoSend: true }),
    );

    fireEvent.click(within(panel).getByRole("button", { name: "跳过，直接写稿" }));
    expect(scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(script);
    expect(createArtifactVersion).not.toHaveBeenCalled();
    script.remove();
  });

  it("历史无标记版本默认不用于写稿，用户明确采用后才追加 adopted 版本", async () => {
    const thesis: ThesisSkeleton = {
      artifactId: "thesis-a",
      versionId: "version-old",
      scriptBasisStatus: "inactive",
      nodes: NODES,
    };
    render(<ThesisSkeletonPanel thesis={thesis} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    expect(within(panel).getByText("尚未用于写稿")).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole("button", { name: "采用并用于写稿" }),
    );
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalledTimes(1));
    expect(createArtifactVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { artifactId: "thesis-a" },
        body: expect.objectContaining({
          expectedCurrentVersionId: "version-old",
          contentData: expect.objectContaining({
            nodes: expect.any(Array),
            scriptBasis: { status: "adopted" },
          }),
        }),
      }),
    );
  });

  it("已采用版本编辑保存保留采用状态，也可显式停止用于写稿", async () => {
    const thesis: ThesisSkeleton = {
      artifactId: "thesis-a",
      versionId: "version-adopted",
      scriptBasisStatus: "adopted",
      nodes: NODES,
    };
    const rendered = render(<ThesisSkeletonPanel thesis={thesis} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    expect(within(panel).getByText("本次写稿采用")).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText("核心论点标题"), {
      target: { value: "修改后的核心观点" },
    });
    fireEvent.click(within(panel).getByRole("button", { name: "保存论点骨架" }));
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalledTimes(1));
    expect(createArtifactVersion.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          expectedCurrentVersionId: "version-adopted",
          contentData: expect.objectContaining({
            scriptBasis: { status: "adopted" },
          }),
        }),
      }),
    );

    // 真实页面里 router.refresh 会带回新版本；测试显式重挂当前服务端真值后再验证反向切换。
    rendered.unmount();
    createArtifactVersion.mockClear();
    render(<ThesisSkeletonPanel thesis={thesis} />);
    const refreshedPanel = screen.getByRole("region", { name: "论点骨架（可选）" });
    fireEvent.click(
      within(refreshedPanel).getByRole("button", { name: "停止用于写稿" }),
    );
    await waitFor(() => expect(createArtifactVersion).toHaveBeenCalledTimes(1));
    expect(createArtifactVersion.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        body: expect.objectContaining({
          expectedCurrentVersionId: "version-adopted",
          contentData: expect.objectContaining({
            scriptBasis: { status: "inactive" },
          }),
        }),
      }),
    );
  });

  it("保存失败保留当前页草稿，并明确提示刷新或离开会丢失", async () => {
    createArtifactVersion.mockRejectedValueOnce(new Error("save down"));
    const thesis: ThesisSkeleton = {
      artifactId: "thesis-a",
      versionId: "version-old",
      scriptBasisStatus: "inactive",
      nodes: NODES,
    };
    render(<ThesisSkeletonPanel thesis={thesis} />);
    const panel = screen.getByRole("region", { name: "论点骨架（可选）" });
    const title = within(panel).getByLabelText("核心论点标题") as HTMLInputElement;
    fireEvent.change(title, { target: { value: "页面内未保存草稿" } });
    fireEvent.click(within(panel).getByRole("button", { name: "保存论点骨架" }));

    await waitFor(() =>
      expect(within(panel).getByText(/尚未保存，刷新或离开会丢失/)).toBeInTheDocument(),
    );
    expect(title.value).toBe("页面内未保存草稿");

    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });
});
