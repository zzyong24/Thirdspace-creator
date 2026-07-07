import "server-only";
import { getActivationService } from "@/server/persistence-client";
import { isDesktopRuntime } from "@/server/activation";

// T-147 P5 桌面激活授权 —— 门控便捷判据(供 (creator)/layout gate 调用)。
//
// 返回 true = 应放行(web/dev 永远 true;桌面态已激活/宽限内 true);false = 未激活/到期,
// 门控应 redirect("/activate")。env 可注入(guard 测试传桩)。
//
// **web/dev 硬短路**:isDesktopRuntime 判 false 时**立即返回 true**,连 getActivationService()
// 都不触碰(不启 persistence、不联网、不读激活态)—— web 绝不被这道门卡住。

export async function isActivationAllowed(
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (!isDesktopRuntime(env)) {
    return true; // web/dev:门不触发,主应用照常。
  }
  const service = await getActivationService();
  const check = await service.check();
  return check.allowed;
}
