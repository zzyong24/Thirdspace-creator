/**
 * 经验裁决台 page 契约测试(T-062a · SPEC §2.1)。
 *
 * 锁定结构不变量:
 *  - TopHeader global 模式 + 「经验沉淀」标题(shell-router 配置,AppShell 包裹);
 *  - Sidebar 激活项 = 经验沉淀;contextual card = assistant(D-003);
 *  - 顶部 3 张真值汇总卡:待裁决 / 已验证 / 已回流校准(待采纳);
 *    回流读侧不可用(null)→ 诚实显「—」;
 *  - 两栏工作台:左 = 裁决队列(candidate 卡:类型徽章 + insight 全文 +
 *    证据行 + 采纳/不采/编辑),右 = 已验证库(learningType 分组)+
 *    底部 discarded 折叠区(带「翻案」);
 *  - 诚实态:空 candidate 队列 → 空态文案;loadError → 错误态,不渲染工作台;
 *  - 旧「快速记录」表单退役 → Copilot 深链 Link(只预填不发送);
 *  - 单一 AppShell,无第二 Sidebar/TopHeader。
 */

import * as React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { ExperienceViewModel } from "./experience-data";

// client 岛调用 useRouter():stub next/navigation 让其脱离真 App Router 挂载。
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// stub next/link,便于断言 href。
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// ---------------------------------------------------------------------------
// 测试 VM(真值形状,无 fixture 依赖)
// ---------------------------------------------------------------------------

const CANDIDATE = {
  id: "learning-c1",
  title: "开头 3 秒必须有钩子",
  insight: "前 3 秒没有冲突/悬念，完播率掉一半。",
  learningType: "hook" as const,
  validationStatus: "candidate" as const,
  confidenceScore: 72,
  reuseCount: 0,
  reviewId: "review-1",
  createdAt: "2026-07-02T10:00:00.000Z",
  updatedAt: "2026-07-02T10:00:00.000Z",
};

const VALIDATED = {
  id: "learning-v1",
  title: "反差开场公式",
  insight: "先立常识再打破，留存 +18%。",
  learningType: "structure" as const,
  validationStatus: "validated" as const,
  confidenceScore: 88,
  reuseCount: 3,
  reviewId: null,
  createdAt: "2026-06-20T10:00:00.000Z",
  updatedAt: "2026-06-28T10:00:00.000Z",
};

const DISCARDED = {
  id: "learning-d1",
  title: "长铺垫也能留人",
  insight: "实测掉完播，不成立。",
  learningType: "failure" as const,
  validationStatus: "discarded" as const,
  confidenceScore: 20,
  reuseCount: 0,
  reviewId: null,
  createdAt: "2026-06-01T10:00:00.000Z",
  updatedAt: "2026-06-02T10:00:00.000Z",
};

function makeVm(
  overrides: Partial<ExperienceViewModel> = {},
): ExperienceViewModel {
  return {
    loadError: false,
    candidates: [CANDIDATE],
    validated: [VALIDATED],
    discarded: [DISCARDED],
    reflowedLearningIds: [],
    summary: {
      candidateCount: 1,
      validatedCount: 1,
      reflowPendingCount: 0,
    },
    ...overrides,
  };
}

async function renderExperience(vm: ExperienceViewModel = makeVm()) {
  const { AppShell } = await import("@/components/shell/app-shell");
  const { ExperiencePage } = await import("./experience-page");
  return render(
    <AppShell
      pathname="/experience"
      headerMode="global"
      pageTitle="经验沉淀"
      pageDescription="被验证的创作经验与失败案例"
    >
      <ExperiencePage viewModel={vm} />
    </AppShell>,
  );
}

describe("ExperiencePage(经验裁决台)", () => {
  afterEach(() => {
    cleanup();
  });

  it("TopHeader global 模式 + 经验沉淀标题", async () => {
    const { container } = await renderExperience();
    const header = container.querySelector('[data-slot="app-top-header"]');
    expect(header).not.toBeNull();
    expect(header!.getAttribute("data-mode")).toBe("global");
    const heading = container.querySelector(
      '[data-slot="header-page-heading"]',
    );
    expect(heading!.textContent ?? "").toContain("经验沉淀");
  });

  it("Sidebar 激活项 = 经验沉淀", async () => {
    await renderExperience();
    const nav = screen.getByRole("navigation", { name: "主要导航" });
    const active = within(nav).getByRole("link", { current: "page" });
    expect(active).toHaveAttribute("href", "/experience");
    expect(active.textContent?.trim()).toBe("经验沉淀");
  });

  it("contextual card variant = assistant(非 storage)", async () => {
    const { container } = await renderExperience();
    expect(
      container.querySelector(
        '[data-slot="sidebar-contextual-card"][data-variant="assistant"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-slot="sidebar-contextual-card"][data-variant="storage"]',
      ),
    ).toBeNull();
  });

  it("顶部 3 张真值汇总卡:待裁决 / 已验证 / 已回流校准", async () => {
    const { container } = await renderExperience();
    const section = container.querySelector(
      '[data-slot="experience-summary-cards"]',
    ) as HTMLElement;
    expect(section).not.toBeNull();
    const cards = section.querySelectorAll('[data-slot="summary-card"]');
    expect(cards).toHaveLength(3);
    expect(
      section.querySelector('[data-summary-id="exp-candidates"]')!.textContent,
    ).toContain("1");
    expect(
      section.querySelector('[data-summary-id="exp-validated"]')!.textContent,
    ).toContain("1");
    expect(
      section.querySelector('[data-summary-id="exp-reflowed"]')!.textContent,
    ).toContain("0");
  });

  it("回流读侧不可用(reflowPendingCount=null)→ 第三张卡诚实显「—」", async () => {
    const { container } = await renderExperience(
      makeVm({
        summary: { candidateCount: 1, validatedCount: 1, reflowPendingCount: null },
      }),
    );
    expect(
      container.querySelector('[data-summary-id="exp-reflowed"]')!.textContent,
    ).toContain("—");
  });

  it("两栏工作台:左裁决队列 + 右已验证库(含 discarded 折叠区)", async () => {
    const { container } = await renderExperience();
    const workbench = container.querySelector(
      '[data-slot="experience-workbench"]',
    ) as HTMLElement;
    expect(workbench).not.toBeNull();
    expect(
      workbench.querySelector('[data-slot="learning-queue"]'),
    ).not.toBeNull();
    expect(
      workbench.querySelector('[data-slot="validated-library"]'),
    ).not.toBeNull();
    expect(
      workbench.querySelector('[data-slot="discarded-section"]'),
    ).not.toBeNull();
  });

  it("candidate 卡:类型徽章 + insight 全文 + 证据行 + 三动作", async () => {
    const { container } = await renderExperience();
    const card = container.querySelector(
      '[data-slot="candidate-card"][data-learning-id="learning-c1"]',
    ) as HTMLElement;
    expect(card).not.toBeNull();
    // learningType 中文徽章(hook → 钩子)。
    const badge = card.querySelector('[data-slot="learning-type-badge"]');
    expect(badge!.textContent).toBe("钩子");
    // insight 全文。
    expect(
      card.querySelector('[data-slot="learning-insight"]')!.textContent,
    ).toBe("前 3 秒没有冲突/悬念，完播率掉一半。");
    // 证据行:reviewId 存在 → 来自复盘;reuseCount=0 真值显 0。
    const evidence = card.querySelector(
      '[data-slot="learning-evidence"]',
    ) as HTMLElement;
    expect(
      evidence.querySelector('[data-slot="learning-source"]')!.textContent,
    ).toBe("来自复盘");
    expect(
      evidence.querySelector('[data-slot="learning-reuse-count"]')!.textContent,
    ).toContain("被 0 个项目应用");
    // 三动作。
    expect(card.querySelector('[data-slot="learning-adopt"]')).not.toBeNull();
    expect(card.querySelector('[data-slot="learning-discard"]')).not.toBeNull();
    expect(card.querySelector('[data-slot="learning-edit"]')).not.toBeNull();
  });

  it("validated 卡按 learningType 分组;手录来源显「手录」;有回流按钮", async () => {
    const { container } = await renderExperience();
    const group = container.querySelector(
      '[data-slot="validated-group"][data-learning-type="structure"]',
    ) as HTMLElement;
    expect(group).not.toBeNull();
    expect(group.textContent).toContain("结构");
    const card = group.querySelector(
      '[data-slot="validated-card"][data-learning-id="learning-v1"]',
    ) as HTMLElement;
    expect(card).not.toBeNull();
    expect(
      card.querySelector('[data-slot="learning-source"]')!.textContent,
    ).toBe("手录");
    expect(card.querySelector('[data-slot="learning-reflow"]')).not.toBeNull();
    expect(
      card.querySelector('[data-slot="learning-reflow-badge"]'),
    ).toBeNull();
  });

  it("服务端 pending 回流集合 → validated 卡显「已回流」徽章(按钮隐藏)", async () => {
    const { container } = await renderExperience(
      makeVm({ reflowedLearningIds: ["learning-v1"] }),
    );
    const card = container.querySelector(
      '[data-slot="validated-card"][data-learning-id="learning-v1"]',
    ) as HTMLElement;
    expect(
      card.querySelector('[data-slot="learning-reflow-badge"]')!.textContent,
    ).toContain("已回流 · 待校准中心采纳");
    expect(card.querySelector('[data-slot="learning-reflow"]')).toBeNull();
  });

  it("discarded 折叠区列出不采记录并带「翻案」按钮", async () => {
    const { container } = await renderExperience();
    const section = container.querySelector(
      '[data-slot="discarded-section"]',
    ) as HTMLElement;
    const row = section.querySelector(
      '[data-slot="discarded-row"][data-learning-id="learning-d1"]',
    ) as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.querySelector('[data-slot="learning-reopen"]')).not.toBeNull();
  });

  it("空 candidate 队列 → 诚实空态文案", async () => {
    const { container } = await renderExperience(
      makeVm({
        candidates: [],
        summary: { candidateCount: 0, validatedCount: 1, reflowPendingCount: 0 },
      }),
    );
    const empty = container.querySelector(
      '[data-slot="learning-queue-empty"]',
    );
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain(
      "暂无待裁决经验——复盘后 AI 会把发现排进来",
    );
  });

  it("loadError → 错误态,不渲染工作台,汇总卡显「—」", async () => {
    const { container } = await renderExperience(
      makeVm({
        loadError: true,
        candidates: [],
        validated: [],
        discarded: [],
        summary: {
          candidateCount: 0,
          validatedCount: 0,
          reflowPendingCount: null,
        },
      }),
    );
    expect(
      container.querySelector('[data-slot="experience-load-error"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-slot="experience-workbench"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-summary-id="exp-candidates"]')!
        .textContent,
    ).toContain("—");
  });

  it("旧快速记录退役 → Copilot 深链「记一条经验」(预填不发送)", async () => {
    const { container } = await renderExperience();
    // 旧表单入口不再渲染。
    expect(
      container.querySelector('[data-slot="quick-record-actions"]'),
    ).toBeNull();
    const link = container.querySelector(
      'a[data-slot="experience-capture-link"]',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("copilot=open");
    expect(href).toContain("surface=experience");
    expect(href).toContain(
      `prefill=${encodeURIComponent("记一条经验:")}`,
    );
  });

  it("单一 AppShell —— 无第二 Sidebar/TopHeader", async () => {
    const { container } = await renderExperience();
    expect(container.querySelectorAll('[data-slot="app-sidebar"]')).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-slot="app-top-header"]'),
    ).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="app-shell"]')).toHaveLength(1);
  });
});
