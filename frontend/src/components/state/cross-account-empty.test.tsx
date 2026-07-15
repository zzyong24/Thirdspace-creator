// [T-332 S4] 深链 404(跨号 by-id)空态:可理解解释 + 回列表动作,且不含
// 「去 B 号查看」跳转(C-03 裁决本期不做,防跨号存在性泄露)。SPEC §4.5/§6.4。

import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CrossAccountEmptyState, EmptyState } from "./page-state";

afterEach(() => cleanup());

describe("CrossAccountEmptyState", () => {
  it("渲染「不属于当前账号」解释 + 回列表深链", () => {
    render(
      <CrossAccountEmptyState
        entityLabel="项目"
        backHref="/projects"
        backLabel="回项目列表"
      />,
    );
    expect(
      screen.getByText("未找到该项目,或它不属于当前账号"),
    ).toBeInTheDocument();
    // 解释「切号 = 切工作区」语义(用户能懂为什么 404)。
    expect(
      screen.getByText(/切换抖音号 = 切换整个工作区/),
    ).toBeInTheDocument();
    const back = screen.getByText("回项目列表");
    expect(back).toHaveAttribute("href", "/projects");
  });

  it("不渲染任何「去另一账号查看」动作(C-03:不泄露跨号存在性)", () => {
    render(
      <CrossAccountEmptyState backHref="/projects" backLabel="回项目列表" />,
    );
    expect(screen.queryByText(/去.*号查看/)).toBeNull();
    // 唯一动作就是回列表链接。
    expect(document.querySelectorAll("a")).toHaveLength(1);
  });
});

describe("EmptyState action 位(§6.2 引导动作)", () => {
  it("传 action → 渲染在文案下方;不传不渲容器", () => {
    const { rerender } = render(
      <EmptyState title="空" action={<a href="/somewhere">去引导</a>} />,
    );
    expect(
      document.querySelector('[data-slot="page-state-empty-action"]'),
    ).not.toBeNull();
    expect(screen.getByText("去引导")).toHaveAttribute("href", "/somewhere");

    rerender(<EmptyState title="空" />);
    expect(
      document.querySelector('[data-slot="page-state-empty-action"]'),
    ).toBeNull();
  });
});
