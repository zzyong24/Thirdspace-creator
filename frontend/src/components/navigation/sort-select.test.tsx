import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";

import { SortSelect } from "./sort-select";

// [T-153] 锁 SortSelect「点得动」——旧版 radio 全 sr-only、无展开菜单(纯装饰),
// 用户报「点不了」。回归锚:trigger 可 toggle 菜单,选项点击回调 onSortChange。

const OPTIONS = [
  { id: "updated", label: "最近更新" },
  { id: "plays", label: "播放量" },
  { id: "likes", label: "点赞" },
];

describe("SortSelect(T-153 修「点不了」)", () => {
  afterEach(() => cleanup());

  it("有真 trigger 按钮(aria-haspopup),默认菜单收起", () => {
    const { container } = render(<SortSelect options={OPTIONS} value="updated" />);
    const trigger = container.querySelector('[data-slot="sort-trigger"]');
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger!.getAttribute("aria-expanded")).toBe("false");
  });

  it("点 trigger 展开菜单(aria-expanded=true)", () => {
    const { container } = render(<SortSelect options={OPTIONS} value="updated" />);
    const trigger = container.querySelector(
      '[data-slot="sort-trigger"]',
    ) as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("展开后点选项 → onSortChange(id) 被调用", () => {
    const onSortChange = vi.fn();
    const { container } = render(
      <SortSelect options={OPTIONS} value="updated" onSortChange={onSortChange} />,
    );
    fireEvent.click(container.querySelector('[data-slot="sort-trigger"]')!);
    // radio 组保留(a11y + 测试锚):点「播放量」选项触发回调。
    const playsRadio = container.querySelector(
      'input[type="radio"][value="plays"]',
    ) as HTMLInputElement;
    expect(playsRadio).not.toBeNull();
    fireEvent.click(playsRadio);
    expect(onSortChange).toHaveBeenCalledWith("plays");
  });

  it("trigger 展示当前排序标签", () => {
    const { container } = render(<SortSelect options={OPTIONS} value="likes" />);
    const trigger = container.querySelector('[data-slot="sort-trigger"]');
    expect(trigger?.textContent ?? "").toContain("点赞");
  });
});
