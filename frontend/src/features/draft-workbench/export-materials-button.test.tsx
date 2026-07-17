/**
 * [T-375] 稿面顶条「导出素材包」接线测试(替换原「在 Finder 打开」):
 *   - 有 outputId → 不 createOutput,直接 getOutputProduction → exportProductionMaterials;
 *   - 无 outputId → 先 createOutput(projectId + title)ensure,再走同链;
 *   - 成功 → 触发下载(a[download])+ 「已开始下载」;
 *   - 失败 → 「导出失败,重试」可再点。
 * 确定性:mock client;无网络。
 */

import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
  createOutput: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "out-new" }),
  ),
  getOutputProduction: vi.fn(
    (_i: unknown): Promise<unknown> => Promise.resolve({ id: "prod-1" }),
  ),
  exportProductionMaterials: vi.fn(
    (_i: unknown): Promise<unknown> =>
      Promise.resolve({
        downloadUrl: "blob:mock-url",
        fileName: "素材包.zip",
        fileCount: 3,
        hasDecisions: false,
      }),
  ),
};
vi.mock("@/lib/contract-client", () => ({
  client: {
    createOutput: (i: unknown) => mockClient.createOutput(i),
    getOutputProduction: (i: unknown) => mockClient.getOutputProduction(i),
    exportProductionMaterials: (i: unknown) =>
      mockClient.exportProductionMaterials(i),
  },
}));

import { ExportMaterialsButton } from "./export-materials-button";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

describe("ExportMaterialsButton (T-375)", () => {
  it("有 outputId → 跳过 createOutput,production get-or-create → 导出 + 下载", async () => {
    render(
      <ExportMaterialsButton
        projectId="p-1"
        projectTitle="测试项目"
        outputId="out-1"
      />,
    );
    const btn = screen.getByRole("button", { name: /导出素材包/ });
    fireEvent.click(btn);
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain("已开始下载"),
    );
    expect(mockClient.createOutput).not.toHaveBeenCalled();
    expect(mockClient.getOutputProduction).toHaveBeenCalledWith({
      params: { outputId: "out-1" },
      query: undefined,
      body: undefined,
    });
    expect(mockClient.exportProductionMaterials).toHaveBeenCalledWith({
      params: { productionId: "prod-1" },
      query: undefined,
      body: undefined,
    });
  });

  it("无 outputId(项目没进过制作面)→ 自动 ensure:先 createOutput 再走导出链", async () => {
    render(
      <ExportMaterialsButton
        projectId="p-2"
        projectTitle="没进过制作面的项目"
        outputId={null}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain("已开始下载"),
    );
    expect(mockClient.createOutput).toHaveBeenCalledWith({
      params: { projectId: "p-2" },
      query: undefined,
      body: { title: "没进过制作面的项目" },
    });
    expect(mockClient.getOutputProduction).toHaveBeenCalledWith({
      params: { outputId: "out-new" },
      query: undefined,
      body: undefined,
    });
    expect(mockClient.exportProductionMaterials).toHaveBeenCalledTimes(1);
  });

  it("失败 → 「导出失败,重试」可再点,重试真的重发", async () => {
    mockClient.exportProductionMaterials.mockRejectedValueOnce(
      new Error("打包炸了"),
    );
    render(
      <ExportMaterialsButton
        projectId="p-1"
        projectTitle="t"
        outputId="out-1"
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain(
        "导出失败,重试",
      ),
    );
    expect(
      (screen.getByRole("button") as HTMLButtonElement).disabled,
    ).toBe(false);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(screen.getByRole("button").textContent).toContain("已开始下载"),
    );
    expect(mockClient.exportProductionMaterials).toHaveBeenCalledTimes(2);
  });
});
