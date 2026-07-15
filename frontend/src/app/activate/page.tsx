import { redirect } from "next/navigation";

import { ActivateForm } from "./activate-form";
import { getActivationService } from "@/server/persistence-client";
import { isDesktopRuntime } from "@/server/activation";

// T-147 P5 桌面激活授权 —— 激活界面(/activate)。
//
// 只桌面壳(CREATOROS_DESKTOP=1)有意义:未激活/年卡到期/超离线宽限时 (creator)/layout gate
// 弹到这里输码。web/dev 不该到这页(没门)—— 直接回首页,别让 web 用户看到激活屏。
//
// 已激活(check.allowed)时也回首页:避免手动敲 /activate 停在这。展示当前状态可读消息(到期/未激活)。

// [T-179] 「联系授权方」链到产品官网购买/联系区(T-168 已上线,含微信/邮箱)。与 settings
//   PURCHASE_URL 同址;桌面端 <a> 外开浏览器。DNS(creatoros.aitongban.cloud→152.136.151.58)配好即达。
const CONTACT_URL = "https://creatoros.aitongban.cloud/#buy";

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

  const service = await getActivationService();
  const check = await service.check();
  // 桌面态已激活/宽限内:不该停在激活页 → 回首页(gate 会放行)。
  if (check.allowed) {
    redirect("/");
  }

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
        <p className="text-center text-xs text-muted-foreground">
          激活码由 CreatorOS 授权方提供,遇问题请
          <a
            href={CONTACT_URL}
            target="_blank"
            rel="noreferrer"
            className="text-primary underline underline-offset-2 hover:opacity-80"
          >
            联系授权方
          </a>
          。
        </p>
      </div>
    </main>
  );
}
