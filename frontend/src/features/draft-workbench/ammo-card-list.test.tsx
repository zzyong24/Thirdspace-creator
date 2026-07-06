import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// [T-146] 稿面内容弹药双击预览测试:弹药区显已上传素材,双击某卡 → 开预览 Modal
// (图片显图 / 文档显资料要点 + 全文)。移除按钮不误触双击预览。

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/contract-client", () => ({ client: {} }));

import { AmmoCardList } from "./ammo-card-list";
import type { DraftWorkbenchVm } from "./draft-workbench-data";

const IMAGE_ITEM: DraftWorkbenchVm["ammo"][number] = {
  linkId: "link-1",
  id: "asset-1",
  kind: "asset",
  title: "封面图.png",
  sourceLabel: "素材 · image",
  previewUrl: "/api/v1/blob/cover?token=t1&exp=999",
  assetType: "image",
  extractStatus: null,
  materialSummary: null,
  extractedText: null,
};

const DOC_ITEM: DraftWorkbenchVm["ammo"][number] = {
  linkId: "link-2",
  id: "asset-2",
  kind: "asset",
  title: "产品PR资料.pdf",
  sourceLabel: "素材 · document",
  previewUrl: null,
  assetType: "document",
  extractStatus: "done",
  materialSummary: { keyPoints: ["卖点A", "卖点B"], facts: ["30天续航"] },
  extractedText: "完整的产品说明全文。",
};

afterEach(() => cleanup());

describe("AmmoCardList — 弹药双击预览", () => {
  it("渲染已上传素材列表(卡片 + 图缩略图)", () => {
    render(<AmmoCardList ammo={[IMAGE_ITEM, DOC_ITEM]} />);
    expect(
      document.querySelectorAll('[data-slot="draft-ammo-card"]'),
    ).toHaveLength(2);
    // 图片素材卡带缩略图预览。
    const img = document.querySelector(
      '[data-slot="ammo-preview"]',
    ) as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toContain("token=t1");
  });

  it("双击图片素材卡 → 开预览 Modal 显真图", () => {
    render(<AmmoCardList ammo={[IMAGE_ITEM]} />);
    // 未双击前 Modal 不渲染。
    expect(
      document.querySelector('[data-slot="material-summary-modal"]'),
    ).toBeNull();
    fireEvent.doubleClick(screen.getByLabelText("预览 封面图.png"));
    const modalImg = document.querySelector(
      '[data-slot="material-modal-image"]',
    ) as HTMLImageElement | null;
    expect(modalImg).toBeTruthy();
    expect(modalImg!.getAttribute("src")).toContain("token=t1");
  });

  it("双击文档素材卡 → Modal 显资料要点 + 全文", () => {
    render(<AmmoCardList ammo={[DOC_ITEM]} />);
    fireEvent.doubleClick(screen.getByLabelText("预览 产品PR资料.pdf"));
    expect(
      document.querySelector('[data-slot="material-summary-modal"]'),
    ).toBeTruthy();
    // 要点(Modal 内全展开)+ 全文都在。
    expect(screen.getByText("卖点A")).toBeTruthy();
    expect(screen.getByText("30天续航")).toBeTruthy();
    expect(screen.getByText("完整的产品说明全文。")).toBeTruthy();
  });
});
