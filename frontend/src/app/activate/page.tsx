import { redirect } from "next/navigation";

import { ActivateForm } from "./activate-form";
import { getActivationService } from "@/server/persistence-client";
import { isDesktopRuntime } from "@/server/activation";
import { isActivationAllowed } from "@/lib/activation-gate.server";
import { getChannelLink } from "@/server/activation/channel-links.server";

// T-147 P5 桌面激活授权 —— 激活界面(/activate)。
//
// 只桌面壳(CREATOROS_DESKTOP=1)有意义:未激活/年卡到期/超离线宽限时 (creator)/layout gate
// 弹到这里输码。web/dev 不该到这页(没门)—— 直接回首页,别让 web 用户看到激活屏。
//
// 已激活(check.allowed)时也回首页:避免手动敲 /activate 停在这。展示当前状态可读消息(到期/未激活)。
//
// [T-396b] 「联系授权方」按激活码所属渠道运行时下发(channel-links 读 Rust 落的缓存):
//   · 有 supportUrl(到期/曾激活过,缓存在)→ 渲染链接;
//   · null(首次激活前本就不知渠道,或渠道未配)→ 纯文案中性降级,**不渲染任何链接**
//     (SPEC §5/§7 红线:不回退官方链接,防代理码用户看到官方定价页)。

// [T-326 ENG-H02 配套] 激活状态是请求期运行时数据(读本地持久层),不该在 next build 预渲染
//   (build 守卫 PersistenceUnavailableDuringBuildError 会正确拦下;旧包能过是因为当时 build
//   真的碰了 DB——正是 ENG-H02 修掉的副作用)。(creator) 树因 resolveSession 用 cookies()
//   天然动态,本页无请求期 API,须显式声明 force-dynamic。
export const dynamic = "force-dynamic";

export default async function ActivatePage(): Promise<React.JSX.Element> {
  // web/dev:无激活门,/activate 无意义 → 回首页。
  if (!isDesktopRuntime(process.env)) {
    redirect("/");
  }

  // [T-372 修环] 「已激活跳回首页」必须与 (creator)/layout gate **同一判定权威**
  // (isActivationAllowed:.license 优先,弱验签回退 DB check)。此前本页直读 DB 而 gate
  // 读 .license——strict 下 .license 缺失时两源分裂:gate 判未激活踢来 /activate,本页
  // 判已激活踢回 / → 无限重定向环,webview 白屏(2026-07-18 真机实证)。
  if (await isActivationAllowed()) {
    redirect("/");
  }

  // DB check 仅用于展示态文案(到期 vs 未激活),不再参与跳转判定。
  const service = await getActivationService();
  const check = await service.check();

  // [T-396b] 渠道「联系授权方」链接(读缓存,无网络;null → 中性降级纯文案)。
  const supportUrl = await getChannelLink("support");

  // 状态可读提示:到期 vs 从未激活,措辞不同。
  const heading =
    check.status === "expired" ? "授权已过期" : "激活 CreatorOS";
  const subtitle =
    check.status === "expired"
      ? "你的授权已到期或失效,请输入有效激活码以继续使用。"
      : "首次使用请输入激活码。激活将绑定本机(一机一码),年卡到期前可离线使用。";

  return (
    <main
      data-testid="activate-page"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl bg-card p-8 text-card-foreground ring-1 ring-foreground/10">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">{heading}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <ActivateForm />
        {supportUrl ? (
          <p className="text-center text-xs text-muted-foreground">
            激活码由 CreatorOS 授权方提供,遇问题请
            <a
              href={supportUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              联系授权方
            </a>
            。
          </p>
        ) : (
          // 中性降级(SPEC §7 操作定义):纯文案,无链接无按钮。
          <p className="text-center text-xs text-muted-foreground">
            请联系你的授权方获取激活码。
          </p>
        )}
      </div>
    </main>
  );
}
