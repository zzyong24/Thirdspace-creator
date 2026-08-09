/**
 * [T-332 S4] 0 个绑定账号的全局引导态(SPEC §4.2:未选号 = 引导态,创作域禁读写;
 * 0 号时所有 per-account 页面显示绑定引导,不是各页各自的干瘪空态/报错)。
 *
 * 由 (creator) layout 判定:该 user 名下没有任何 active 抖音号,且当前路径是
 * per-account 创作域页面 → 用本引导整页替换 children(壳/侧栏保留,导航不锁死)。
 * 账号管理、设置等 user 级页面放行(否则用户没入口去绑号,死锁)。
 *
 * Server-safe(无 "use client"):layout 是 RSC,引导本身纯静态。
 */

import * as React from "react";
import Link from "next/link";

/**
 * user 级页面前缀白名单 —— 0 号也放行(绑号入口 / 共享配置 / 激活)。
 * 其余 (creator) 路径视为 per-account 创作域,0 号 → 引导。
 */
const ZERO_ACCOUNT_ALLOWED_PREFIXES = [
  "/accounts", // 账号管理:绑定入口本体,绝不能拦
  "/settings", // 设置:模型配置等 user 级共享配置(C-01 裁决:模型配置共享)
  // [T-663] 知识库默认入口是随包课程,课程不依赖账号；用户切到
  // `?view=knowledge` 时由 route 自己返回绑定引导，不能让 layout 把课程也盖掉。
  "/knowledge",
  "/activate", // 桌面激活流程
  "/login",
] as const;

/**
 * 纯判定:0 号时该路径是否仍放行(不渲染绑定引导)。
 *
 * [T-348] 首页 `/` 放行 —— 恢复完整引导流:0 号进首页看 OnboardingCard 有序引导
 * (绑号 = 高亮第一步),而非被守卫盖成光秃秃「去绑定」页。首页自身的 per-account 读
 * (pages.dashboard.get)降级由首页 route 自己 catch(见 app/(creator)/page.tsx),
 * 不再靠全局守卫兜底 —— 守卫兜底会把整条引导流一并切掉(T-344 的回归根因)。
 */
export function isZeroAccountAllowedPath(pathname: string): boolean {
  if (pathname === "/") return true; // 首页 = 引导流主场,恒放行
  return ZERO_ACCOUNT_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** 0 号引导整页(替换 per-account 页面的 children;壳导航保留)。 */
export function ZeroAccountGuidance() {
  return (
    <main
      data-app="creatoros"
      data-page="zero-account-guidance"
      data-testid="zero-account-guidance"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-xl text-brand"
      >
        @
      </span>
      <h1 className="font-heading text-xl font-semibold text-foreground">
        先绑定一个抖音号,再开始创作
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        工作区按抖音号完全隔离：定位、选题、项目、知识库、素材和发布数据都归属于具体账号。绑定后系统会自动建好该账号的日常采集任务。
      </p>
      <Link
        href="/accounts"
        data-testid="zero-account-bind-link"
        className="mt-2 inline-flex h-10 items-center justify-center rounded-card bg-brand px-5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
      >
        去绑定抖音号
      </Link>
      {/* [T-348] 次级动作:回首页看完整上手引导(0 号首页已恢复 OnboardingCard 有序引导流)。 */}
      <Link
        href="/"
        data-testid="zero-account-home-link"
        className="text-xs font-medium text-brand underline-offset-4 hover:underline"
      >
        或回首页看完整上手引导
      </Link>
    </main>
  );
}
