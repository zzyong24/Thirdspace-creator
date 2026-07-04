/**
 * 知识库工作台 Tabs 外壳契约测试(T-113 · IA 收敛 SPEC §B / [gate-F3])。
 *
 * 锁定:
 *  - 两页签「知识库」(默认选中)/「经验沉淀」;
 *  - `defaultTab="experience"` 深链 → 经验 Tab 默认选中(SSR/刷新保持);
 *  - 切页签 → `router.replace` 写回 `?tab=`(knowledge 省略 query 保持干净,
 *    experience 显式 `?tab=experience`);
 *  - 两个 Tab body(slot)如实挂载,内容不被外壳改写。
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/knowledge",
}));

import {
  KnowledgeWorkspaceTabs,
  type KnowledgeWorkspaceTab,
} from "./knowledge-workspace-tabs";

function renderTabs(defaultTab: KnowledgeWorkspaceTab = "knowledge") {
  return render(
    <KnowledgeWorkspaceTabs
      defaultTab={defaultTab}
      knowledgeSlot={<div data-testid="knowledge-slot">知识库内容</div>}
      experienceSlot={<div data-testid="experience-slot">经验沉淀内容</div>}
    />,
  );
}

describe("KnowledgeWorkspaceTabs(知识库工作台双 Tab)", () => {
  afterEach(() => {
    cleanup();
    replace.mockReset();
  });

  it("渲染两页签「知识库」/「经验沉淀」,默认选中知识库", async () => {
    const { container } = renderTabs();
    const list = container.querySelector('[data-slot="tabs-list"]') as HTMLElement;
    expect(within(list).getByRole("tab", { name: "知识库" })).not.toBeNull();
    expect(within(list).getByRole("tab", { name: "经验沉淀" })).not.toBeNull();
    // 默认 knowledge Tab 选中,body 可见。
    const knowledgeTab = within(list).getByRole("tab", { name: "知识库" });
    expect(knowledgeTab.getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("knowledge-slot")).not.toBeNull();
  });

  it("[gate-F3] defaultTab=experience(深链)→ 经验 Tab 默认选中", () => {
    const { container } = renderTabs("experience");
    const list = container.querySelector('[data-slot="tabs-list"]') as HTMLElement;
    const experienceTab = within(list).getByRole("tab", { name: "经验沉淀" });
    expect(experienceTab.getAttribute("data-state")).toBe("active");
    expect(screen.getByTestId("experience-slot")).not.toBeNull();
  });

  it("[gate-F3] 切到经验 Tab → router.replace('/knowledge?tab=experience')", async () => {
    const user = userEvent.setup();
    renderTabs("knowledge");
    await user.click(screen.getByRole("tab", { name: "经验沉淀" }));
    expect(replace).toHaveBeenCalledWith(
      "/knowledge?tab=experience",
      expect.objectContaining({ scroll: false }),
    );
  });

  it("[gate-F3] 切回知识库 Tab → router.replace('/knowledge')(省略 query 保持干净)", async () => {
    const user = userEvent.setup();
    renderTabs("experience");
    await user.click(screen.getByRole("tab", { name: "知识库" }));
    expect(replace).toHaveBeenCalledWith(
      "/knowledge",
      expect.objectContaining({ scroll: false }),
    );
  });
});
