import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatScriptPatchCard } from "./chat-script-patch-card";

const refresh = vi.fn();
const applyScriptPatch = vi
  .fn<(input: unknown) => Promise<{ id: string }>>()
  .mockResolvedValue({ id: "version-7" });
const restoreArtifact = vi
  .fn<(input: unknown) => Promise<{ id: string }>>()
  .mockResolvedValue({ id: "version-8" });

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/contract-client", () => ({
  client: {
    applyScriptPatch: (input: unknown) => applyScriptPatch(input),
    restoreArtifact: (input: unknown) => restoreArtifact(input),
  },
}));

const candidate = {
  kind: "script.patch" as const,
  artifactId: "artifact-1",
  versionId: "version-6",
  sectionId: "section-1",
  originalText: "旧段落",
  replacementText: "只替换这一段的新内容",
  summary: "收紧表达",
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  applyScriptPatch.mockResolvedValue({ id: "version-7" });
});

describe("[T-716] ChatScriptPatchCard", () => {
  it("采纳时只向后端发送锚定补丁命令，不在前端拼整稿", async () => {
    render(<ChatScriptPatchCard candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: "采纳这处修改" }));
    await waitFor(() => expect(applyScriptPatch).toHaveBeenCalledTimes(1));
    expect(applyScriptPatch).toHaveBeenCalledWith({
      params: { artifactId: "artifact-1" },
      query: undefined,
      body: {
        expectedVersionId: "version-6",
        sectionId: "section-1",
        expectedOriginalText: "旧段落",
        replacementText: "只替换这一段的新内容",
        changeSummary: "收紧表达",
      },
    });
    expect(screen.getByText("已写入稿面并保存为新版本")).toBeInTheDocument();
  });

  it("后端并发校验失败时展示可行动错误，不伪造成功", async () => {
    applyScriptPatch.mockRejectedValue(
      new Error("脚本在补丁生成后已经更新，请基于当前稿面重新发起局部改稿"),
    );
    render(<ChatScriptPatchCard candidate={candidate} />);
    fireEvent.click(screen.getByRole("button", { name: "采纳这处修改" }));
    expect(
      await screen.findByText(/脚本在补丁生成后已经更新/),
    ).toBeInTheDocument();
    expect(applyScriptPatch).toHaveBeenCalledTimes(1);
  });

  it("[T-812/T-819] 建议稿与原文相同则禁用采纳并明确提示", () => {
    render(
      <ChatScriptPatchCard
        candidate={{
          ...candidate,
          originalText: "原文  没变化",
          replacementText: "  原文 没变化 ",
        }}
      />,
    );
    expect(screen.getByText(/没有可采纳的修改/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "采纳这处修改" }),
    ).toBeDisabled();
    expect(applyScriptPatch).not.toHaveBeenCalled();
  });
});
