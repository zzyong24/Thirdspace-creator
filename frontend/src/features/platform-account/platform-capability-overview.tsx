import type { PlatformCapabilityState } from "@creatoros/contract";
import type { PlatformAccountResource } from "@creatoros/backend/modules/platform-account";
import { PLATFORM_LABELS } from "./platform-account-labels";

const CAPABILITY_NAMES: Record<string, string> = {
  bind: "账号绑定",
  workCatalog: "作品目录",
  accountOverview: "账号数据",
  workMetrics: "作品数据",
};

const VISIBLE_PLATFORMS = [
  "douyin", "xiaohongshu", "kuaishou", "wechatOfficialAccount",
] as const;
const VISIBLE_CAPABILITIES = [
  "bind", "workCatalog", "accountOverview", "workMetrics",
] as const;

function statusText(state: PlatformCapabilityState | undefined): string {
  if (!state) return "状态未确认";
  if (state.supported && state.runtimeState === "ready") {
    return state.lastVerifiedAt ? "可用" : "已接入";
  }
  if (state.authState === "expired" || state.authState === "revoked" || state.runtimeState === "needsAuth") {
    return "需要重新授权";
  }
  if (state.runtimeState === "rateLimited") return "平台暂时限制访问";
  if (state.runtimeState === "degraded") return "部分数据暂不可用";
  if (state.reasonCode === "SOURCE_UNMAPPED") return "尚未接入";
  return "暂时不可用";
}

/** Read-only status. Every action remains in the real account/collection flow. */
export function PlatformCapabilityOverview({
  capabilities,
  accounts = [],
  readError = false,
}: {
  readonly capabilities: readonly PlatformCapabilityState[];
  readonly accounts?: readonly PlatformAccountResource[];
  readonly readError?: boolean;
}) {
  if (readError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        暂时无法读取平台接入状态。已有账号不受影响，请稍后刷新页面。
      </p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="platform-capability-overview">
      {VISIBLE_PLATFORMS.map((platform) => (
        <section key={platform} className="rounded-md border border-border p-3" data-platform={platform}>
          <h3 className="font-medium text-foreground">{PLATFORM_LABELS[platform]}</h3>
          <dl className="mt-2 grid gap-1 text-xs">
            {VISIBLE_CAPABILITIES.filter((capability) => platform !== "douyin" || capability !== "bind").map((capability) => {
              const state = capabilities.find((entry) => entry.platform === platform && entry.capability === capability);
              return (
                <div key={capability} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{CAPABILITY_NAMES[capability]}</dt>
                  <dd className={state?.supported && state.runtimeState === "ready" ? "text-success" : "text-muted-foreground"}>
                    {capability === "bind" && accounts.some((account) =>
                      account.platform === platform && account.status === "active")
                      ? "已绑定"
                      : statusText(state)}
                  </dd>
                </div>
              );
            })}
            {platform === "douyin" ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">账号绑定</dt>
                <dd className={accounts.some((account) => account.platform === "douyin" && account.status === "active")
                  ? "text-success" : "text-muted-foreground"}>
                  {accounts.some((account) => account.platform === "douyin" && account.status === "active")
                    ? "已绑定" : "点击绑定账号"}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ))}
    </div>
  );
}
