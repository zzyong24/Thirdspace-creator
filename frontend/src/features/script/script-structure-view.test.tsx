/**
 * ScriptStructureToggle(T-070 口播脚本结构化展示)。
 * 编辑视图默认渲 children;切「结构」渲分段卡(序号/段型徽章/标题/正文/字数);
 * 无分段诚实引导空态。
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ScriptStructureToggle } from "./script-structure-view";
import type { ScriptSectionView } from "@/types/view-models";

afterEach(() => cleanup());

const SECTIONS: ScriptSectionView[] = [
  {
    id: "s-1",
    type: "hook",
    heading: "开场钩子",
    body: "前 3 秒直接放结论:论文能跑起来才算读懂。",
    emphasis: true,
    startSeconds: 0,
    endSeconds: 15,
  },
  {
    id: "s-2",
    type: "body",
    heading: "",
    body: "先把环境锁死,再逐模块复现。",
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  },
  {
    id: "s-3",
    type: "golden_quote",
    heading: "金句",
    body: "跑不通的 idea 只是感想。",
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  },
];

describe("ScriptStructureToggle", () => {
  it("默认编辑视图渲 children;切结构渲分段卡(徽章/标题/正文/时间/字数)", () => {
    render(
      <ScriptStructureToggle sections={SECTIONS}>
        <div data-testid="editor-stub">编辑器</div>
      </ScriptStructureToggle>,
    );
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-slot="script-view-structure"]')!);
    expect(screen.queryByTestId("editor-stub")).toBeNull();
    const cards = document.querySelectorAll('[data-slot="script-structure-section"]');
    expect(cards).toHaveLength(3);
    expect(screen.getByText("钩子")).toBeInTheDocument();
    expect(screen.getByText("金句", { selector: "span.rounded-full" })).toBeInTheDocument();
    expect(screen.getByText("开场钩子")).toBeInTheDocument();
    expect(screen.getByText(/前 3 秒直接放结论/)).toBeInTheDocument();
    // 时间 + 字数行(第一段 0:00–0:15)。
    expect(screen.getByText(/0:00–0:15/)).toBeInTheDocument();
    // 切回编辑。
    fireEvent.click(document.querySelector('[data-slot="script-view-edit"]')!);
    expect(screen.getByTestId("editor-stub")).toBeInTheDocument();
  });

  it("无分段 → 诚实引导空态,不硬拆", () => {
    render(
      <ScriptStructureToggle sections={[]}>
        <div>编辑器</div>
      </ScriptStructureToggle>,
    );
    fireEvent.click(document.querySelector('[data-slot="script-view-structure"]')!);
    expect(
      document.querySelector('[data-slot="script-structure-empty"]'),
    ).not.toBeNull();
    expect(screen.getByText(/让编导整稿起草会自动带分段/)).toBeInTheDocument();
  });
});
