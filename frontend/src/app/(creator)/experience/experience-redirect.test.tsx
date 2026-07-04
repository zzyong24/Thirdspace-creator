/**
 * `/experience` route redirect 契约测试(T-113 · IA 收敛 SPEC §B)。
 *
 * 经验沉淀独立入口退役后,`/experience` 只做服务端重定向到
 * `/knowledge?tab=experience`(防旧链接/书签失效)。这里锁定 route 组件
 * 调用 `redirect("/knowledge?tab=experience")`,不再渲染经验页。
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
  it("redirect 到 /knowledge?tab=experience", () => {
    expect(() => ExperienceRoute()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/knowledge?tab=experience");
  });
});
