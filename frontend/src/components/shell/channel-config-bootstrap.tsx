"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {useWorkspaceInitialization} from './workspace-initialization';
import {useCreationScope,type CreationScope} from '@/lib/creation-workspace-scope';
import {isDesktopRuntimeClient} from '@/lib/desktop-updater';
import {fetchLastShellDecision,subscribeShellDecision,type ShellGateDecision} from '@/lib/shell-license';
import {ensureAutomaticLicenseUpgrade,invalidateAutomaticLicenseUpgradeScope,automaticUpgradeScopeKey,readAutomaticLicenseUpgrade} from '@/lib/automatic-license-upgrade';
import {fetchCreatorApi} from '@/lib/http-transport';

const ENDPOINT = "/api/v1/local/client-config";
const SCOPE_MISSING_ACTION = "授权缺少渠道信息，无法同步受管模型";
const BOOTSTRAP_COMPLETED_KEY = "creatoros:client-config-bootstrap-completed";
const BOOTSTRAP_FRESHNESS_MS=5*60*1000;
const RETRY_DELAYS_MS=[0,1000,3000,10000] as const;

export const CLIENT_CONFIG_SYNCED_EVENT = "creatoros:client-config-synced";

type SyncResult = {
  readonly ok: boolean;
  readonly outcome: string;
  readonly action: string;
  readonly retryable: boolean;
};

function broadcastSuccess(): void {
  window.dispatchEvent(
    new CustomEvent(CLIENT_CONFIG_SYNCED_EVENT, {
      detail: { outcome: "configured" },
    }),
  );
}

function markBootstrappedInThisWindow(): void {
  try {
    window.sessionStorage.setItem(
      BOOTSTRAP_COMPLETED_KEY,
      String(Date.now()),
    );
  } catch {
    // WebView 禁用存储时仍允许同步；只是不依赖存储作为业务真相。
  }
}

function hasBootstrappedInThisWindow():boolean{
  try{const completedAt=Number(window.sessionStorage.getItem(BOOTSTRAP_COMPLETED_KEY));return Number.isFinite(completedAt)&&completedAt>0&&Date.now()-completedAt<BOOTSTRAP_FRESHNESS_MS;}catch{return false;}
}

async function pullClientConfig(
  signal: AbortSignal | undefined,
  trigger: "bootstrap" | "manual_revalidate",
): Promise<SyncResult> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    cache: "no-store",
    headers: { "x-creatoros-config-trigger": trigger },
    signal,
  });
  const body = (await response.json().catch(() => null)) as {
    outcome?: unknown;
    action?: unknown;
    retryable?: unknown;
  } | null;
  const outcome =
    typeof body?.outcome === "string" ? body.outcome : "unreachable";
  return {
    ok: response.ok,
    outcome,
    action:
      outcome === "activation_scope_missing"
        ? SCOPE_MISSING_ACTION
        : typeof body?.action === "string"
          ? body.action
          : "渠道配置暂时不可用，请稍后重试",
    retryable: body?.retryable === true,
  };
}

async function revalidateAndPull(): Promise<SyncResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const decision = await invoke<{ licensed?: unknown }>("license_check");
  if (decision?.licensed !== true) {
    return {
      ok: false,
      outcome: "license_unavailable",
      action: "激活权益复校未通过，请重新激活后再试",
      retryable: false,
    };
  }
  return pullClientConfig(undefined, "manual_revalidate");
}

/** 设置页与启动提示共用的真实恢复动作：Rust 在线复校 → 本地可信 route 同步 → 刷新 SSR。 */
export function ChannelConfigRetryButton({
  onSuccess,
}: {
  readonly onSuccess?: () => void;
}): React.JSX.Element {
  const { refresh } = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const retry = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await revalidateAndPull();
      if (!result.ok) {
        setError(result.action);
        return;
      }
      markBootstrappedInThisWindow();
      broadcastSuccess();
      refresh();
      onSuccess?.();
    } catch {
      setError("重新校验暂时不可用，请稍后重试");
    } finally {
      setPending(false);
    }
  };

  return (
    <span className="mt-2 flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => void retry()}
        className="rounded-md border border-current px-2.5 py-1.5 text-xs font-medium disabled:cursor-wait disabled:opacity-60"
      >
        {pending
          ? "正在重新校验并同步…"
          : "重新校验激活权益并重试配置同步"}
      </button>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** 无感核对只唤醒共享owner，不等待在导航、不整页刷新、不把组件卸载当业务取消。 */
export function ChannelConfigBootstrap(): React.JSX.Element | null {
  const initialization=useWorkspaceInitialization(),scope=useCreationScope(),desktop=isDesktopRuntimeClient();
  const previousScope=React.useRef<CreationScope|null>(null);
  const [decision,setDecision]=React.useState<ShellGateDecision|null>(null);
  React.useEffect(()=>{
    if(!desktop)return;
    let disposed=false,unlisten:(()=>void)|null=null,received=0;
    void (async()=>{
      // 先订阅再补读，避免挂载期间漏掉原生已经完成的新判定。
      unlisten=await subscribeShellDecision(value=>{received++;if(!disposed)setDecision(value);});
      if(disposed){unlisten?.();return;}
      const revision=received,initial=await fetchLastShellDecision();
      if(!disposed&&received===revision)setDecision(initial);
    })();
    return()=>{disposed=true;unlisten?.();};
  },[desktop]);
  React.useEffect(()=>{
    if(!desktop)return;
    const frozen:CreationScope={groupId:scope.groupId,accountId:scope.groupId?null:scope.accountId};
    if(previousScope.current&&automaticUpgradeScopeKey(previousScope.current)!==automaticUpgradeScopeKey(frozen))invalidateAutomaticLicenseUpgradeScope(previousScope.current);
    previousScope.current=frozen;
    if(decision&&(!decision.licensed||decision.revoked)){invalidateAutomaticLicenseUpgradeScope(frozen);return;}
    if(!initialization?.ready||!decision?.licensed||decision.revoked)return;
    let disposed=false,timer:ReturnType<typeof setTimeout>|null=null;
    const ordinary=new AbortController();
    const pullOrdinary=async(attempt:number):Promise<void>=>{
      if(disposed||ordinary.signal.aborted||hasBootstrappedInThisWindow())return;
      try{
        // 兼容旧渠道/白标路径；普通bootstrap保持只读经济行为，不携带automatic/action。
        const response=await fetchCreatorApi(ENDPOINT,{method:'POST',cache:'no-store',headers:{'x-creatoros-config-trigger':'bootstrap'},signal:ordinary.signal},frozen);
        const body=await response.json().catch(()=>null) as {retryable?:boolean}|null;
        if(disposed||ordinary.signal.aborted)return;
        if(response.ok){markBootstrappedInThisWindow();broadcastSuccess();return;}
        if(body?.retryable!==true)return;
      }catch{if(disposed||ordinary.signal.aborted)return;}
      const next=attempt+1;if(next>=RETRY_DELAYS_MS.length)return;
      timer=setTimeout(()=>void pullOrdinary(next),RETRY_DELAYS_MS[next]);
    };
    // 同realm重挂/许可事件只join模块owner；自动的未知不能被普通同步冒充成功。
    void ensureAutomaticLicenseUpgrade(frozen).catch(()=>{}).then(()=>{
      if(disposed)return;
      const automatic=readAutomaticLicenseUpgrade();
      if(automatic.status==='ready'||automatic.phase==='binding'||automatic.reasonCode?.startsWith('RESTORE_'))return;
      void pullOrdinary(0);
    });
    // 这里只结束独立普通read；coordinator及已经发出的native继续由模块owner持有。
    return()=>{disposed=true;ordinary.abort();if(timer)clearTimeout(timer);};
  },[desktop,scope.groupId,scope.accountId,initialization?.ready,decision]);
  return null;
}
