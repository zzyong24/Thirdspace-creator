/**
 * `/experience` route redirect 契约测试(T-118c · 经验归位 SPEC §C)。
 *
 * 经验模块彻底退役后,`/experience` 只做服务端重定向到 `/knowledge`(去掉旧的
 * `?tab=experience` —— 经验 Tab 已退役,/knowledge 收敛为单一库视图)。这里锁定
 * route 组件调用 `redirect("/knowledge")`,不再渲染经验页。
 */

import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((_url: string) => {
  // Next 的 redirect 会 throw 一个特殊信号中断渲染;这里用普通 throw 模拟中断,
  // 断言的是「以正确 url 调用」而非 throw 行为。
  throw new Error("NEXT_REDIRECT");
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

import ExperienceRoute from "./page";

describe("/experience route(退役 → 重定向)", () => {
  it("redirect 到 /knowledge(经验 Tab 退役,去掉旧 ?tab=experience)", () => {
    expect(() => ExperienceRoute()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/knowledge");
  });
});
