/**
 * [T-332 S5] ResetWorkspaceCard(重置工作区危险区卡)交互测试。
 *
 * 覆盖:①web 态 → 桌面端专属空态,无重置入口;②桌面态 → 弹层列清除范围 + 归档说明,
 * 确认词不对不放行;③确认词对 → POST /api/v1/local/reset-workspace → 成功态
 * 「已安排重置,重启应用后生效」;④route 报错 → 弹层内诚实错误态;⑤「立即重启」
 * relaunch 不可用 → 降级手动重启提示;⑥「在 Finder 查看数据目录」→ 打 reveal 端点。
 *
 * `@/lib/desktop-updater` 全 mock(不真跑 Tauri);fetch 用 stubGlobal 桩。
 * 确认词与 route 侧 plan.ts 的 RESET_CONFIRM_WORD 双写(client 组件不能 import
 * node:path 模块)—— 用例⑦锁两侧同值,单改必崩测。
 */

import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 被测薄封装 mock:逐用例控制桌面态探测 + relaunch 结果。
const mockIsDesktop = vi.fn<() => boolean>();
const mockRelaunch = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/desktop-updater", () => ({
  isDesktopRuntimeClient: () => mockIsDesktop(),
  relaunchApp: () => mockRelaunch(),
}));

import { ResetWorkspaceCard } from "./reset-workspace-card";
import { RESET_CONFIRM_WORD } from "@/app/api/v1/local/reset-workspace/plan";

const CONFIRM_WORD = "重置";

// fetch 桩:返回值形如 Response 的最小子集(组件只用 ok/json)。
const mockFetch = vi.fn();
function fetchOk(body: unknown, status = 200) {
  mockFetch.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  mockIsDesktop.mockReset();
  mockRelaunch.mockReset();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 渲染卡片(桌面态挂载后 isDesktopRuntimeClient() 翻真)并等 data-desktop 落定。 */
async function renderCard(desktop: boolean) {
  mockIsDesktop.mockReturnValue(desktop);
  render(<ResetWorkspaceCard />);
  await waitFor(() => {
    const card = document.querySelector('[data-slot="reset-workspace-card"]');
    expect(card?.getAttribute("data-desktop")).toBe(String(desktop));
  });
  return document;
}

/** 桌面态:打开二次确认弹层。 */
async function openDialog() {
  const doc = await renderCard(true);
  fireEvent.click(
    doc.querySelector('[data-slot="reset-workspace-action"]') as HTMLElement,
  );
  await waitFor(() =>
    expect(
      doc.querySelector('[data-slot="reset-workspace-dialog"]'),
    ).not.toBeNull(),
  );
  return doc;
}

function confirmInput(doc: Document): HTMLInputElement {
  return doc.querySelector(
    '[data-slot="reset-workspace-confirm-input"]',
  ) as HTMLInputElement;
}

function confirmButton(doc: Document): HTMLButtonElement {
  return doc.querySelector(
    '[data-slot="reset-workspace-confirm"]',
  ) as HTMLButtonElement;
}

describe("ResetWorkspaceCard — web 态", () => {
  it("桌面端专属空态,无重置入口", async () => {
    const doc = await renderCard(false);
    expect(
      doc.querySelector('[data-slot="reset-workspace-badge"]')?.textContent,
    ).toContain("桌面端专属");
    expect(doc.querySelector('[data-slot="reset-workspace-action"]')).toBeNull();
  });
});

describe("ResetWorkspaceCard — 桌面态", () => {
  it("危险区徽章 + 「重置工作区」入口;弹层列清除范围与归档说明", async () => {
    const doc = await openDialog();
    expect(
      doc.querySelector('[data-slot="reset-workspace-badge"]')?.textContent,
    ).toContain("危险区");

    const dialog = doc.querySelector('[data-slot="reset-workspace-dialog"]');
    const text = dialog?.textContent ?? "";
    // 清除范围逐条列明(项目/选题/素材/发布/采集/账号登录态)。
    expect(text).toContain("项目");
    expect(text).toContain("选题");
    expect(text).toContain("发布记录、采集数据与复盘");
    expect(text).toContain("登录态");
    // 明示归档保留、不物理删除。
    expect(text).toContain("不会物理删除");
    // 确认词输入为空 → 确认按钮禁用。
    expect(confirmButton(doc).disabled).toBe(true);
  });

  it("确认词不对 → 确认按钮保持禁用,不发请求", async () => {
    const doc = await openDialog();
    fireEvent.change(confirmInput(doc), { target: { value: "确认" } });
    expect(confirmButton(doc).disabled).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("确认词正确 → POST reset-workspace → 成功态「已安排重置,重启应用后生效」", async () => {
    fetchOk({ ok: true, pending: true });
    const doc = await openDialog();
    fireEvent.change(confirmInput(doc), { target: { value: CONFIRM_WORD } });
    expect(confirmButton(doc).disabled).toBe(false);
    fireEvent.click(confirmButton(doc));

    await waitFor(() =>
      expect(
        doc.querySelector('[data-slot="reset-workspace-scheduled"]'),
      ).not.toBeNull(),
    );
    const scheduled = doc.querySelector(
      '[data-slot="reset-workspace-scheduled"]',
    );
    expect(scheduled?.textContent).toContain("已安排重置,重启应用后生效");
    // 成功态提供「立即重启」。
    expect(
      doc.querySelector('[data-slot="reset-workspace-relaunch"]'),
    ).not.toBeNull();

    // 请求形态:POST + 确认词经 body 提交(route 会再验,不信任 UI)。
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/v1/local/reset-workspace",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      }),
    );
  });

  it("route 报错 → 弹层内诚实错误态,不假装成功", async () => {
    fetchOk({ error: "确认词不正确,请输入「重置」" }, 400);
    const doc = await openDialog();
    fireEvent.change(confirmInput(doc), { target: { value: CONFIRM_WORD } });
    fireEvent.click(confirmButton(doc));

    await waitFor(() => {
      const fb = doc.querySelector('[data-slot="reset-workspace-feedback"]');
      expect(fb?.getAttribute("data-tone")).toBe("error");
      expect(fb?.textContent).toContain("确认词不正确");
    });
    // 未进成功态。
    expect(
      doc.querySelector('[data-slot="reset-workspace-scheduled"]'),
    ).toBeNull();
  });

  it("「立即重启」relaunch 不可用 → 降级手动重启提示(绝不假装已重启)", async () => {
    fetchOk({ ok: true, pending: true });
    mockRelaunch.mockResolvedValue(false);
    const doc = await openDialog();
    fireEvent.change(confirmInput(doc), { target: { value: CONFIRM_WORD } });
    fireEvent.click(confirmButton(doc));
    await waitFor(() =>
      expect(
        doc.querySelector('[data-slot="reset-workspace-relaunch"]'),
      ).not.toBeNull(),
    );

    fireEvent.click(
      doc.querySelector('[data-slot="reset-workspace-relaunch"]') as HTMLElement,
    );
    await waitFor(() => {
      const hint = doc.querySelector(
        '[data-slot="reset-workspace-manual-hint"]',
      );
      expect(hint?.textContent).toContain("手动退出并重新打开");
    });
    expect(mockRelaunch).toHaveBeenCalledTimes(1);
  });

  it("「在 Finder 查看数据目录」→ 打 reveal-data-dir 端点", async () => {
    fetchOk({ ok: true, dir: "/tmp/appdata" });
    const doc = await openDialog();
    fireEvent.click(
      doc.querySelector('[data-slot="reset-workspace-reveal"]') as HTMLElement,
    );
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/local/reveal-data-dir",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("确认词与 route 侧 plan.ts 双写同值(单改必崩测)", () => {
    expect(CONFIRM_WORD).toBe(RESET_CONFIRM_WORD);
  });
});
