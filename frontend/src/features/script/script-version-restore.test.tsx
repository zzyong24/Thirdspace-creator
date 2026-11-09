import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScriptVersionMenu } from "./script-version-restore";
import { beginForegroundActivity } from "@/lib/foreground-activity";

const refresh = vi.fn();
const restoreArtifact = vi
  .fn<(input: unknown) => Promise<{ ok: boolean }>>()
  .mockResolvedValue({ ok: true });

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/contract-client", () => ({
  client: {
    restoreArtifact: (input: unknown) => restoreArtifact(input),
  },
}));

const versions = [
  {
    id: "version-1",
    label: "v1",
    versionNumber: 1,
    createdAt: "2026-08-01T09:00:00.000Z",
    summary: "初稿",
    previewText: "第一版",
  },
  {
    id: "version-3",
    label: "v3",
    versionNumber: 3,
    createdAt: "2026-08-03T09:00:00.000Z",
    summary: "当前稿",
    previewText: "第三版",
  },
  {
    id: "version-2",
    label: "v2",
    versionNumber: 2,
    createdAt: "2026-08-02T09:00:00.000Z",
    summary: "收紧开头",
    previewText: "第二版",
  },
] as const;

afterEach(cleanup);
beforeEach(() => {
  refresh.mockClear();
  restoreArtifact.mockClear();
});

describe("[T-716] ScriptVersionMenu", () => {
  it("版本下拉始终按版本号倒序，并标记当前版本", () => {
    render(
      <ScriptVersionMenu
        artifactId="artifact-1"
        currentVersionId="version-3"
        versions={versions}
      />,
    );
    const select = screen.getByLabelText("选择口播稿版本") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "version-3",
      "version-2",
      "version-1",
    ]);
    expect(select.options[0]?.textContent).toContain("当前");
  });

  it("选择旧版本后先展示摘要，确认才切换到该既有版本", async () => {
    render(
      <ScriptVersionMenu
        artifactId="artifact-1"
        currentVersionId="version-3"
        versions={versions}
      />,
    );
    fireEvent.change(screen.getByLabelText("选择口播稿版本"), {
      target: { value: "version-2" },
    });
    expect(screen.getByText("收紧开头")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "恢复此版本" }));
    await waitFor(() => {
      expect(restoreArtifact).toHaveBeenCalledWith({
        params: { artifactId: "artifact-1" },
        query: undefined,
        body: { versionId: "version-2" },
      });
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("B6（月明录屏 2026-11-10）：选旧版本能看到该版正文预览，恢复成功后明确提示「已恢复到 vN」", async () => {
    const view = render(
      <ScriptVersionMenu
        artifactId="artifact-1"
        currentVersionId="version-3"
        versions={versions}
      />,
    );
    fireEvent.change(screen.getByLabelText("选择口播稿版本"), {
      target: { value: "version-1" },
    });
    const preview = screen.getByRole("region", { name: "v1 正文预览" });
    expect(preview).toHaveTextContent("第一版");
    expect(preview).toHaveTextContent("预览中，尚未恢复");
    fireEvent.click(screen.getByRole("button", { name: "恢复此版本" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已恢复到 v1"));
    // 页面 refresh 后当前版本指针变成 v1：提示保留、下拉回到当前、预览收起。
    view.rerender(
      <ScriptVersionMenu
        artifactId="artifact-1"
        currentVersionId="version-1"
        versions={versions}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("已恢复到 v1");
    expect((screen.getByLabelText("选择口播稿版本") as HTMLSelectElement).value).toBe("version-1");
    expect(screen.queryByRole("region", { name: /正文预览/ })).toBeNull();
  });

  it("B6：稿面有未保存修改时不恢复（否则失焦自动保存会把旧稿再存成新版本盖回去），提示先保存", async () => {
    const end = beginForegroundActivity("脚本有未保存的修改");
    try {
      render(
        <ScriptVersionMenu artifactId="artifact-1" currentVersionId="version-3" versions={versions} />,
      );
      fireEvent.change(screen.getByLabelText("选择口播稿版本"), { target: { value: "version-1" } });
      fireEvent.click(screen.getByRole("button", { name: "恢复此版本" }));
      expect(screen.getByRole("alert")).toHaveTextContent("先保存");
      expect(restoreArtifact).not.toHaveBeenCalled();
    } finally {
      end();
    }
  });
});
