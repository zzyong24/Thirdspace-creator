import * as React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

// [T-146] 资料要点共用件测试:①折叠优先(前 N 条 + 就地展开)②「查看全文」Modal 开合
// ③图片素材在 Modal 顶部渲真图。素材中心详情面板 + 稿面弹药双击预览都复用这套组件。

import {
  MaterialSummaryList,
  MaterialSummaryModal,
  materialSummaryHasCard,
} from "./material-summary";

afterEach(() => cleanup());

const FIVE_POINTS = ["点1", "点2", "点3", "点4", "点5"] as const;

describe("MaterialSummaryList — 折叠优先", () => {
  it("超过 limit 只显前 N 条 + 「展开全部」按钮", () => {
    render(
      <MaterialSummaryList summary={{ keyPoints: FIVE_POINTS }} limit={3} />,
    );
    // 只显前 3 条。
    expect(screen.getByText("点1")).toBeTruthy();
    expect(screen.getByText("点3")).toBeTruthy();
    expect(screen.queryByText("点4")).toBeNull();
    expect(screen.queryByText("点5")).toBeNull();
    // 展开按钮显剩余总数。
    expect(screen.getByText("展开全部 5 条")).toBeTruthy();
  });

  it("点「展开全部」显示全部,再点「收起」回折叠", () => {
    render(
      <MaterialSummaryList summary={{ keyPoints: FIVE_POINTS }} limit={3} />,
    );
    fireEvent.click(screen.getByText("展开全部 5 条"));
    expect(screen.getByText("点4")).toBeTruthy();
    expect(screen.getByText("点5")).toBeTruthy();
    fireEvent.click(screen.getByText("收起"));
    expect(screen.queryByText("点4")).toBeNull();
  });

  it("条数不超过 limit 时不显展开按钮", () => {
    render(
      <MaterialSummaryList summary={{ keyPoints: ["a", "b"] }} limit={3} />,
    );
    expect(screen.queryByText(/展开全部/)).toBeNull();
  });
});

describe("materialSummaryHasCard", () => {
  it("任一组非空 → true;全空/缺省 → false", () => {
    expect(materialSummaryHasCard({ keyPoints: ["x"] })).toBe(true);
    expect(materialSummaryHasCard({ facts: [], sellingPoints: [] })).toBe(false);
    expect(materialSummaryHasCard(null)).toBe(false);
    expect(materialSummaryHasCard(undefined)).toBe(false);
  });
});

describe("MaterialSummaryModal — 查看全文弹层", () => {
  function Harness({ url }: { url?: string | null }) {
    const [open, setOpen] = React.useState(false);
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          开
        </button>
        <MaterialSummaryModal
          open={open}
          onOpenChange={setOpen}
          title="产品资料.pdf"
          summary={{ keyPoints: FIVE_POINTS }}
          fullText="这是抽取的全文内容。"
          previewUrl={url ?? null}
        />
      </div>
    );
  }

  it("闭合时不渲染内容;打开后显完整要点(Modal 内 limit=∞ 全展开)+ 全文", () => {
    render(<Harness />);
    expect(screen.queryByText("这是抽取的全文内容。")).toBeNull();
    fireEvent.click(screen.getByText("开"));
    const modal = document.querySelector(
      '[data-slot="material-summary-modal"]',
    );
    expect(modal).toBeTruthy();
    // Modal 内全展开(limit=∞):第 5 条也在,且无「展开全部」按钮。
    expect(screen.getByText("点5")).toBeTruthy();
    expect(screen.queryByText(/展开全部/)).toBeNull();
    // 全文渲染。
    expect(screen.getByText("这是抽取的全文内容。")).toBeTruthy();
  });

  it("图片 previewUrl → Modal 顶部渲真图(块1 同款签名 URL)", () => {
    render(<Harness url="/api/v1/blob/img?token=abc&exp=999" />);
    fireEvent.click(screen.getByText("开"));
    const img = document.querySelector(
      '[data-slot="material-modal-image"]',
    ) as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toContain("token=abc");
  });
});
