import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScriptVersionMenu } from "./script-version-restore";

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
});
