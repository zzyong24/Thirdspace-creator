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

/**
 * user 级页面前缀白名单 —— 0 号也放行(绑号入口 / 共享配置 / 激活)。
 * 其余 (creator) 路径视为 per-account 创作域,0 号 → 引导。
 */
const ZERO_ACCOUNT_ALLOWED_PREFIXES = [
  "/accounts", // 账号管理:绑定入口本体,绝不能拦
  "/settings", // 设置:模型配置等 user 级共享配置(C-01 裁决:模型配置共享)
  "/activate", // 桌面激活流程
  "/login",
] as const;

/** 纯判定:0 号时该路径是否仍放行(不渲染绑定引导)。 */
export function isZeroAccountAllowedPath(pathname: string): boolean {
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
        CreatorOS 的工作区按抖音号完全隔离:定位、选题、项目、知识库、素材、发布数据都归属于具体账号。绑定后系统会自动建好该号的日常采集任务。
      </p>
      <a
        href="/accounts"
        data-testid="zero-account-bind-link"
        className="mt-2 inline-flex h-10 items-center justify-center rounded-card bg-brand px-5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
      >
        去绑定抖音号
      </a>
    </main>
  );
}
