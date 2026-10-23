"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/contract-client";
import { handshakeHeaders } from "@/lib/handshake-client";
import { fetchCreatorApi, readCurrentAccountId, readCurrentGroupId } from "@/lib/http-transport";
import { executionTimeoutMs, completionWaitMs } from "@creatoros/contract/timeout-policy";
import { openAiCreditCenter, waitForAiCreditCenter, withAiCreditCenterBudget, AI_CREDIT_CENTER_OPEN_WAIT_MS } from "@/lib/open-ai-credit-center";
import { cn } from "@/lib/utils";
import {parseLegacyUpgradeResult,parseNativeRestoreResult,parseUpgradeObservationToken,UPGRADE_OBSERVATION_HEADER,type UpgradeAction,type LegacyUpgradeResult} from "@/lib/legacy-license-upgrade";
import {refreshModelRoutingAfterUpgrade} from "@/features/copilot/assistant-engine";
import {
  Loader2
} from "lucide-react";

import type {
  ChannelModelServiceState,
  ModelCapabilityAuthorityState
} from "./settings-page";

import { TestConnectionButton } from "./model-connection-test";
import { useSettingsMutation } from "./use-settings-mutation";
const INCLUDED_CREDIT_WAIT_MS = 730_000;
function IncludedCreditActivation() {
  const router = useRouter();
  const [busy,setBusy] = React.useState(false),[message,setMessage] = React.useState<string|null>(null),[canContinue,setCanContinue] = React.useState(false);
  const generation=React.useRef(0),active=React.useRef<AbortController|null>(null),nativePending=React.useRef(false);
  const observationToken=React.useRef<string|null>(null);
  const observationDeadline=React.useRef<number|null>(null);
  const resume=React.useRef<'economic'|'binding'|'config'|null>(null),knownReady=React.useRef(false),needsNative=React.useRef(false);
  React.useEffect(()=>{
    let scope=JSON.stringify([readCurrentGroupId(),readCurrentAccountId()]);
    const changed=()=>{
      const next=JSON.stringify([readCurrentGroupId(),readCurrentAccountId()]);if(next===scope)return;
      scope=next;generation.current++;active.current?.abort();active.current=null;resume.current=null;knownReady.current=false;needsNative.current=false;
      observationToken.current=null;
      observationDeadline.current=null;
      setBusy(false);setCanContinue(false);setMessage(null);
    };
    window.addEventListener('creatoros:accounts-changed',changed);window.addEventListener('storage',changed);
    return()=>{generation.current++;active.current?.abort();window.removeEventListener('creatoros:accounts-changed',changed);window.removeEventListener('storage',changed);};
  },[]);
  const activate=async()=>{
    if(active.current)return;
    const continuing=canContinue,previousResume=resume.current,reuseObservation=continuing&&previousResume==='config'&&knownReady.current;
    if(reuseObservation&&(observationDeadline.current===null||Date.now()>=observationDeadline.current)){
      knownReady.current=false;needsNative.current=false;observationToken.current=null;observationDeadline.current=null;resume.current=null;setCanContinue(false);setMessage('原授权或核对期限已变化，请重新点击升级入口核对当前原码');return;
    }
    const current=++generation.current,controller=new AbortController();active.current=controller;
    if(!reuseObservation){observationToken.current=null;observationDeadline.current=Date.now()+INCLUDED_CREDIT_WAIT_MS;}
    const scope={groupId:readCurrentGroupId(),accountId:readCurrentAccountId()};
    const same=()=>current===generation.current&&scope.groupId===readCurrentGroupId()&&scope.accountId===readCurrentAccountId();
    const live=()=>{if(!same()||controller.signal.aborted)throw new DOMException('已停止等待','AbortError');};
    const timer=setTimeout(()=>controller.abort(),Math.max(0,observationDeadline.current!-Date.now()));
    let submitted=false;
    const wait=<T,>(operation:()=>Promise<T>|T)=>waitForAiCreditCenter(operation,controller.signal);
    const pending=(kind:'economic'|'binding'|'config',text:string)=>{live();resume.current=kind;setCanContinue(true);setMessage(text);};
    const read=async(action:UpgradeAction)=>{
      live();if(action==='fulfill')submitted=true;
      const existing=observationToken.current;
      const response=await wait(()=>fetchCreatorApi('/api/v1/local/client-config',{method:'POST',cache:'no-store',signal:controller.signal,headers:{'x-creatoros-config-trigger':'legacy_upgrade','x-creatoros-upgrade-action':action,...(existing?{[UPGRADE_OBSERVATION_HEADER]:existing}:{})}},scope));
      const value=await wait(()=>response.json());live();
      const result=parseLegacyUpgradeResult(value,action),received=response.headers.get(UPGRADE_OBSERVATION_HEADER);
      if(received!==null){const token=parseUpgradeObservationToken(received);if(existing!==null&&token!==existing)throw Error('本次原权益观察已变化');observationToken.current=token;}
      if(!observationToken.current&&['ready','restore_required','pending'].includes(result.outcome))throw Error('本次原权益观察尚未确认');
      return result;
    };
    const identityChanged=()=>{knownReady.current=false;needsNative.current=false;observationToken.current=null;observationDeadline.current=null;resume.current=null;setCanContinue(false);setMessage('原授权或核对期限已变化，请重新点击升级入口核对当前原码');};
    const sync=async()=>{
      const result=await read('sync');
      if(result.reasonCode==='UPGRADE_IDENTITY_CHANGED'){identityChanged();return;}
      if(result.configurationStatus!=='ready'||result.entitlementStatus!=='ready'){
        pending('config',knownReady.current?'原模型权益已就绪，配置仍待核对；不会重复领取原权益':'配置尚未核对完成，请继续核对原权益');return;
      }
      knownReady.current=true;
      try{await wait(()=>refreshModelRoutingAfterUpgrade(controller.signal));live();}
      catch{live();pending('config','原模型权益已就绪，界面配置尚未读回，请继续核对');return;}
      resume.current=null;setCanContinue(false);setMessage('原激活码已升级，模型权益与配置已核对，个人模型来源保持不变');router.refresh();
    };
    const stop=(result:LegacyUpgradeResult)=>{
      if(result.reasonCode==='UPGRADE_IDENTITY_CHANGED'){identityChanged();return;}
      if(result.outcome==='blocked'){
        if(result.reasonCode==='UPGRADE_EXISTING_OPERATION_PENDING')pending('economic','原权益仍有待确认的操作，请先核对原操作；不会另开模型账户');
        else {setCanContinue(false);setMessage(result.reasonCode==='UPGRADE_LICENSE_REVOKED'||result.reasonCode==='UPGRADE_LICENSE_INELIGIBLE'?'当前原授权不符合模型权益条件，请核对原许可状态':'当前授权无法安全核对，原有工作已保留，请稍后再试');}
      }else pending('economic','原模型权益结果尚未确认，请继续核对；不会更换原账户或重复领取');
    };
    setBusy(true);setCanContinue(false);setMessage('正在核对原激活码与模型权益，你可以继续使用其它功能');
    try{
      if(continuing&&previousResume==='config'&&knownReady.current){await sync();return;}
      let result=await read('probe');
      if(result.outcome==='restore_required'||needsNative.current){
        if(nativePending.current){pending('binding','原授权恢复仍在进行，请稍后继续核对；已发出的请求不会重复提交');return;}
        needsNative.current=true;
        // UI取消不撤销IPC；直到真实promise收尾才允许本组件再提交原生请求。
        let raw:unknown;
        const token=parseUpgradeObservationToken(observationToken.current);
        const {invoke}=await wait(()=>import('@tauri-apps/api/core'));live();nativePending.current=true;
        const work=Promise.resolve().then(()=>{live();submitted=true;return invoke<unknown>('license_restore_saved',{observationToken:token});});
        void work.then(()=>{nativePending.current=false;},()=>{nativePending.current=false;});
        raw=await wait(()=>work);
        live();const saved=parseNativeRestoreResult(raw);
        if(saved.status!=='ready'){
          if(saved.status==='blocked'&&!saved.retryable){setCanContinue(false);setMessage('当前授权无法安全核对，原有工作已保留，请稍后再试');return;}
          // 未知之后只读一次；不能据fresh proof绕过本机保存未确认。
          if(saved.status==='unknown')await read('probe');
          pending('binding','原绑定结果尚未确认，请继续核对；本次不会再次提交恢复');return;
        }
        needsNative.current=false;result=await read('probe');
        if(result.outcome==='restore_required'){pending('binding','原绑定仍需核对，请继续核对；本次不会再次提交恢复');return;}
      }
      if(result.entitlementStatus==='ready'){knownReady.current=true;await sync();return;}
      const explicitRecovery=continuing&&previousResume==='economic';
      const canFulfill=result.bindingStatus==='verified'&&(result.reasonCode==='UPGRADE_ENTITLEMENT_NOT_READY'||result.reasonCode==='UPGRADE_WALLET_NOT_LINKED'||explicitRecovery&&result.reasonCode==='UPGRADE_ENTITLEMENT_UNKNOWN');
      if(!canFulfill){stop(result);return;}
      result=await read('fulfill');
      if(result.entitlementStatus==='ready'){knownReady.current=true;await sync();return;}
      if(result.outcome==='unknown'||result.outcome==='pending'){
        const observed=await read('probe');
        if(observed.entitlementStatus==='ready'){knownReady.current=true;await sync();return;}
        pending('economic','原模型权益结果尚未确认，请继续核对；不会更换原账户或重复领取');return;
      }
      stop(result);
    }catch{
      if(same()){
        resume.current=knownReady.current?'config':needsNative.current?'binding':'economic';setCanContinue(true);
        setMessage(controller.signal.aborted?(submitted?'已停止等待，已提交的结果仍需核对；请稍后继续核对':'已停止等待，本次核对尚未完成；请稍后继续核对'):knownReady.current?'原模型权益已就绪，配置仍待核对；不会重复领取原权益':'升级结果尚未确认，请继续核对原权益，也可先使用自配模型');
      }
    }finally{clearTimeout(timer);if(current===generation.current){active.current=null;setBusy(false);}}
  };
  return <div data-slot="included-credit-activation" className="flex w-full flex-col gap-3 border-b border-border/70 pb-4">
    <p className="text-base leading-6 text-muted-foreground">原激活码可在这里升级模型权益，无需换码或重新购买。原许可期限、已有钱包与个人模型来源保持不变；模型费用和额度按原权益规则使用。</p>
    <div className="flex flex-wrap gap-3">
      <Button type="button" className="min-h-11 text-base" disabled={busy} onClick={()=>void activate()}>{busy?'正在核对原权益…':canContinue?'继续核对':'升级原激活码，启用模型权益'}</Button>
      {busy&&<Button type="button" className="min-h-11 text-base" variant="outline" onClick={()=>active.current?.abort()}>取消等待</Button>}
    </div>
    {message&&<p role="status" className="text-base leading-6">{message}</p>}
  </div>;
}

export function AiCreditCenterCard({ accountStatus }: { readonly accountStatus?: "ready" | "not_configured" | "unverified" } = {}) {
  const [opening, setOpening] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const openingGeneration = React.useRef(0);
  const openingController = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    let scope = JSON.stringify([readCurrentGroupId(), readCurrentAccountId()]);
    const change = () => {
      const next = JSON.stringify([readCurrentGroupId(), readCurrentAccountId()]);
      if (next === scope) return;
      scope = next; openingGeneration.current++; openingController.current?.abort(); openingController.current = null;
      setOpening(false); setError(null);
    };
    window.addEventListener("creatoros:accounts-changed", change); window.addEventListener("storage", change);
    return () => {
      openingGeneration.current++; openingController.current?.abort();
      window.removeEventListener("creatoros:accounts-changed", change); window.removeEventListener("storage", change);
    };
  }, []);
  const openCredits = React.useCallback(async () => {
    if (openingController.current) return;
    const current = ++openingGeneration.current;
    const controller = new AbortController(); openingController.current = controller;
    const live = () => current === openingGeneration.current && !controller.signal.aborted;
    setOpening(true); setError(null);
    try {
      await openAiCreditCenter({ signal: controller.signal, isCurrent: live });
    } catch (cause) {
      if (live()) setError(cause instanceof Error ? cause.message : "暂时无法打开 AI 额度，请稍后重试");
    } finally {
      if (current === openingGeneration.current) { openingController.current = null; setOpening(false); }
    }
  }, []);

  return (
    <SectionCard
      title="AI 额度与消耗"
      description="前往额度中心查看总额度、已消耗和剩余额度，并进行购买或充值。"
    >
      <IncludedCreditActivation />
      <div
        data-slot="ai-credit-center-card"
        className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="text-base leading-6 text-muted-foreground">
          首次使用时按页面提示完成账号连接；之后可从这里直接进入额度中心。
        </p>
        {accountStatus !== "not_configured" ? <Button
          type="button"
          data-slot="open-ai-credit-center"
          disabled={opening}
          onClick={() => void openCredits()}
        >
          {opening ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {opening ? "正在打开…" : "查看 AI 额度与消耗"}
        </Button> : null}
      </div>
      {error ? (
        <p data-slot="ai-credit-center-error" className="mt-2 text-base text-destructive">
          {error}
        </p>
      ) : null}
      <AiCreditBootstrapForm />
    </SectionCard>
  );
}

export function ManagedCapabilityPendingCard({
  capability,
  title,
  highlight,
}: {
  readonly capability:
  | "default"
  | "transcribe.audio"
  | "image.generate"
  | "video.generate";
  readonly title: string;
  readonly highlight:
  | "text-model"
  | "asr-model"
  | "image-model"
  | "video-model";
}) {
  return (
    <SectionCard
      title={title}
      description="当前权益尚未同步这项能力。无需填写服务商、接口地址或密钥。"
    >
      <div
        data-slot={highlight}
        data-capability={capability}
        className="flex flex-col items-start gap-2 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2.5"
      >
        <p className="text-xs leading-5 text-muted-foreground">
          {capability === "transcribe.audio"
            ? "请重新校验并同步当前权益；同步完成前仍可使用本地语音转文字，只是处理时间较长。"
            : "请重新校验并同步当前权益后再试。"}
        </p>
      </div>
    </SectionCard>
  );
}

export function ChannelServiceCredentialCard({
  service,
}: {
  service: ChannelModelServiceState;
}) {
  const [secret, setSecret] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const { pending, run } = useSettingsMutation();
  const save = React.useCallback(async () => {
    if(!secret.trim() || pending) return;
    setError(null);
    try {
      await run(() =>
        client.putChannelModelCredential({
          params: { serviceId: service.serviceId },
          query: undefined,
          body: { secret: secret.trim() },
        }),
      );
      setSecret("");
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请重试");
    }
  }, [pending, run, secret, service.serviceId]);
  return (
    <SectionCard
      title="模型访问密钥"
      description="密钥只加密保存在本机，不会上传到产品配置。"
    >
      <div
        data-slot="channel-model-service-credential"
        data-service-id={service.serviceId}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={service.hasSecret ? "text-success" : "text-warning"}
          >
            {service.hasSecret ? "已填写" : "待填写"}
          </Badge>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            data-slot="channel-model-service-secret"
            type="password"
            value={secret}
            disabled={pending}
            onChange={(event) => setSecret(event.target.value)}
            placeholder={
              service.hasSecret
                ? "留空保持不变，填写后覆盖"
                : "粘贴这个服务的 API Key"
            }
            aria-label="模型访问密钥"
          />
          <Button
            type="button"
            disabled={!secret.trim() || pending}
            onClick={() => void save()}
          >
            {pending ? "保存中…" : service.hasSecret ? "更新密钥" : "保存密钥"}
          </Button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </SectionCard>
  );
}

export function ChannelManagedModelCard({
  state,
  title,
  highlight,
}: {
  state: ModelCapabilityAuthorityState;
  title: string;
  highlight: string;
}) {
  const router = useRouter();
  const [switching, setSwitching] = React.useState(false);
  const [selectionError, setSelectionError] = React.useState<string | null>(null);
  const selectModel = React.useCallback(async (optionId: string) => {
    setSwitching(true);
    setSelectionError(null);
    try {
      const response = await fetch("/api/v1/local/channel-model-selection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...handshakeHeaders(),
        },
        body: JSON.stringify({ capability: state.capability, optionId }),
      });
      if(!response.ok) throw new Error("模型切换失败，请重新同步渠道配置后重试");
      router.refresh();
    } catch(error) {
      setSelectionError(error instanceof Error ? error.message : "模型切换失败");
    } finally {
      setSwitching(false);
    }
  }, [router, state.capability]);
  return (
    <SectionCard
      title={title}
      description="当前权益已提供这项能力，无需填写密钥；有多个模型时可以直接选择。"
    >
      <div
        data-slot="channel-managed-model-card"
        data-capability={state.capability}
        data-highlight={highlight}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">已配置</Badge>
          <span className="text-sm font-medium text-foreground">
            {state.modelName ?? "模型已就绪"}
          </span>
        </div>
        {state.selectionNotice ? (
          <p className="text-xs text-warning">{state.selectionNotice}</p>
        ) : null}
        {(state.modelOptions?.length ?? 0) > 1 ? (
          <label className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">使用模型</span>
            <select
              aria-label={`${title}使用模型`}
              value={state.optionId ?? ""}
              disabled={switching}
              onChange={(event) => void selectModel(event.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2"
            >
              {state.modelOptions?.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {selectionError ? <p className="text-xs text-destructive">{selectionError}</p> : null}
        <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <p
            className={cn(
              "text-xs",
              state.hasSecret ? "text-success" : "text-warning",
            )}
          >
            {state.hasSecret
              ? "当前权益已就绪"
              : "模型正在准备，请重新同步配置"}
          </p>
          {state.capability === "transcribe.audio" ? null : (
            <TestConnectionButton
              capability={state.capability}
              slotPrefix={`channel-${state.capability.replaceAll(".", "-")}`}
              disabled={!state.hasSecret}
            />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// cc-switch-style configurable provider binding. provider / model / baseUrl /
// apiFormat are free-form; the API key is stored in the LOCAL db (masked to
// `hasSecret` on read — the raw key is never echoed back). A single 保存 upserts
// the "default" capability via `settings.models.put`; resolve.ts then reads it
// (stored key preferred over env-ref) with a global-default fallback.
// [T-325] 顶部加「供应商预设」下拉:选一家 → 填 baseUrl/接口格式 + 切模型候选 datalist。

// 已到账后同步/开窗是独立completion；不续reserve/resume的资金operation deadline。
const AI_CREDIT_CONFIG_SYNC_WAIT_MS = completionWaitMs([120_000, 120_000, 120_000, 120_000]);
// cold readiness120000+execution120000+原completion grace10000，再留HTTP观察余量10000。
// FIFO无公开长度上界：超出有限观察保原shared GET/后端任务，不重发、不称全队列worst。
const AI_CREDIT_ROUTING_OBSERVER_WAIT_MS = completionWaitMs([120_000, 120_000], 20_000);
const AI_CREDIT_PAID_COMPLETION_WAIT_MS = completionWaitMs([
  AI_CREDIT_CONFIG_SYNC_WAIT_MS, AI_CREDIT_ROUTING_OBSERVER_WAIT_MS, AI_CREDIT_CENTER_OPEN_WAIT_MS,
]);
type BootstrapView = {
  contractVersion: "growth-ai-credit-bootstrap-v1"; operationRef: string;
  status: "pending" | "provider_unknown" | "applied" | "expired";
  creditUnits: number; expiresAt: string;
};
function readBootstrapView(value: unknown): BootstrapView {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!row || Object.keys(row).sort().join() !== ["contractVersion", "operationRef", "status", "creditUnits", "expiresAt"].sort().join() ||
    row.contractVersion !== "growth-ai-credit-bootstrap-v1" || typeof row.operationRef !== "string" ||
    !/^AICLE-[A-Za-z0-9_-]{6,96}$/.test(row.operationRef) ||
    typeof row.status !== "string" || !["pending", "provider_unknown", "applied", "expired"].includes(row.status) ||
    typeof row.creditUnits !== "number" || !Number.isSafeInteger(row.creditUnits) || row.creditUnits <= 0 ||
    typeof row.expiresAt !== "string" || !Number.isFinite(Date.parse(row.expiresAt))) throw new Error("开通结果无法验证，请保留原操作并查询");
  return row as unknown as BootstrapView;
}
function AiCreditBootstrapForm() {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [operationRef, setOperationRef] = React.useState("");
  const [operation, setOperation] = React.useState<BootstrapView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [uncertain, setUncertain] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const attempt = React.useRef<{ digest: string; key: string } | null>(null);
  const inFlight = React.useRef(false);
  const generation = React.useRef(0);
  const abort = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    let scope = `${readCurrentGroupId() ?? ""}:${readCurrentAccountId() ?? ""}`;
    const change = () => {
      const next = `${readCurrentGroupId() ?? ""}:${readCurrentAccountId() ?? ""}`;
      if (next === scope) return;
      scope = next; generation.current++; abort.current?.abort(); attempt.current = null;
      inFlight.current = false; setBusy(false); setCode(""); setOperationRef(""); setOperation(null); setError(null); setUncertain(false);
    };
    window.addEventListener("creatoros:accounts-changed", change);
    window.addEventListener("storage", change);
    return () => { generation.current++; abort.current?.abort(); window.removeEventListener("creatoros:accounts-changed", change); window.removeEventListener("storage", change); };
  }, []);
  async function perform(action: "reserve" | "read" | "resume" | "connect") {
    if (inFlight.current) return;
    const submittedCode = code.trim();
    const ref = operation?.operationRef ?? operationRef.trim();
    if (action === "reserve" && !/^AICR-[A-Za-z0-9_-]{35,59}$/.test(submittedCode)) { setError("请输入自己的有效充值码"); return; }
    if (action !== "reserve" && !/^AICLE-[A-Za-z0-9_-]{6,96}$/.test(ref)) { setError("请填写原操作编号"); return; }
    inFlight.current = true; setBusy(true); setError(null);
    if (action === "reserve") setCode("");
    const current = generation.current;
    const scope = { groupId: readCurrentGroupId(), accountId: readCurrentAccountId() };
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(), action === "connect" ? AI_CREDIT_PAID_COMPLETION_WAIT_MS : executionTimeoutMs(900_000));
    const live = () => current === generation.current && !controller.signal.aborted &&
      scope.groupId === readCurrentGroupId() && scope.accountId === readCurrentAccountId();
    let sent = false;
    try {
      if (action === "reserve") {
        // 只在当前提交中持有充值码；未确认时只保摘要和原幂等键，显式恢复不得换码。
        const bytes = await waitForAiCreditCenter(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(submittedCode)), controller.signal);
        const digest = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
        if (!live()) return;
        if (attempt.current && attempt.current.digest !== digest) { setError("本次结果尚未确认，请输入原充值码恢复同一次提交"); return; }
        attempt.current ??= { digest, key: `bootstrap-${crypto.randomUUID()}` };
      }
      if (action === "connect") {
        if (operation?.status !== "applied") return;
        const { sync, body } = await withAiCreditCenterBudget(AI_CREDIT_CONFIG_SYNC_WAIT_MS, controller.signal, async signal => {
          const sync = await waitForAiCreditCenter(() => fetchCreatorApi("/api/v1/local/client-config", { method: "POST", cache: "no-store", signal, headers: { "x-creatoros-config-trigger": "bootstrap" } }, scope), signal);
          if (!live()) throw new DOMException("当前账号组已变化，请保留原操作", "AbortError");
          const body = await waitForAiCreditCenter(() => sync.json(), signal) as { outcome?: string; authority?: string; action?: string };
          return { sync, body };
        });
        if (!live()) return;
        if (!sync.ok || body.outcome !== "configured" || body.authority !== "channel") throw new Error("兑换已到账，但配置同步暂未完成，请保留原操作后重试同步");
        window.dispatchEvent(new CustomEvent("creatoros:client-config-synced", { detail: { outcome: "configured" } }));
        router.refresh();
        await withAiCreditCenterBudget(AI_CREDIT_ROUTING_OBSERVER_WAIT_MS, controller.signal, async signal => {
          const { loadModelRouting } = await waitForAiCreditCenter(() => import("@/features/copilot/assistant-engine"), signal);
          if (!live()) throw new DOMException("当前账号组已变化，请保留原操作", "AbortError");
          // 借等原shared GET，取消的是本观察者，不能清除/abort全局读者或另发GET。
          await waitForAiCreditCenter(() => loadModelRouting(true), signal);
        });
        if (!live()) return;
        await openAiCreditCenter({ signal: controller.signal, isCurrent: live });
        return;
      }
      const path = action === "reserve" ? "/api/v1/local/ai-credits/bootstrap" :
        `/api/v1/local/ai-credits/bootstrap/${encodeURIComponent(ref)}${action === "resume" ? "/resume" : ""}`;
      const response = await waitForAiCreditCenter(() => {
        sent = true; // 原signal已取消则thunk不调用，不把未发出的请求当成未知资金提交。
        return fetchCreatorApi(path, {
        method: action === "read" ? "GET" : "POST", cache: "no-store", signal: controller.signal,
        headers: action === "read" ? {} : { "Content-Type": "application/json", ...(action === "reserve" ? { "Idempotency-Key": attempt.current!.key } : {}) },
        ...(action === "reserve" ? { body: JSON.stringify({ serviceId: "omnihi-main", code: submittedCode }) } : action === "resume" ? { body: "{}" } : {}),
        }, scope);
      }, controller.signal);
      const value: unknown = await waitForAiCreditCenter(() => response.json(), controller.signal);
      if (!live()) return;
      if (!response.ok) {
        const failed = value && typeof value === "object" ? value as { error?: unknown; uncertain?: unknown } : {};
        if (action === "reserve") {
          const unknown = failed.uncertain === true; setUncertain(unknown);
          if (!unknown) attempt.current = null;
        }
        throw new Error(typeof failed.error === "string" ? failed.error : "开通结果尚未确认，请保留原操作并查询");
      }
      const result = readBootstrapView(value);
      if (action !== "reserve" && result.operationRef !== ref) throw new Error("操作身份无法验证，请保留原操作并查询");
      setOperation(result); setOperationRef(result.operationRef); setUncertain(false); attempt.current = null;
    } catch (cause) {
      if (current !== generation.current) return;
      if (action === "reserve" && sent && attempt.current) setUncertain(true);
      setError(action === "connect" && (cause as { name?: unknown } | null)?.name === "AbortError"
        ? "本次等待已结束或取消，兑换已到账，请保留原操作后重试同步"
        : cause instanceof Error ? cause.message : "到账结果尚未确认，请保留原操作并查询");
    } finally {
      clearTimeout(timer);
      if (current === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }
  const status = operation ? ({ pending: "开通处理中", provider_unknown: "到账确认中，请查询原操作，不要更换充值码", applied: "本次兑换已到账", expired: "原操作期限已到，请保留编号核对到账状态，不要更换充值码" } as const)[operation.status] : null;
  return <details data-slot="ai-credit-bootstrap" className="mt-3 border-t border-border/70 pt-3">
    <summary className="cursor-pointer text-sm font-medium">使用充值码开通官方额度</summary>
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-xs leading-5 text-muted-foreground">没有官方额度账户时，可使用自己的充值码开通。已有账户请在额度中心充值。</p>
      {!operation ? <div className="flex flex-col gap-2 sm:flex-row">
        <Input aria-label="官方额度充值码" type="password" autoComplete="off" value={code} disabled={busy} onChange={event => setCode(event.target.value)} placeholder={uncertain ? "重新输入原充值码，恢复同一次提交" : "粘贴自己的 AICR 充值码"}/>
        <Button type="button" disabled={busy || !code.trim()} onClick={() => void perform("reserve")}>{uncertain ? "恢复原提交" : "兑换并开通"}</Button>
      </div> : null}
      {uncertain ? <p className="text-xs text-warning">本次请求结果尚未确认。只恢复同一次提交；已有操作编号时，请查询原操作。</p> : null}
      <label className="flex flex-col gap-2 text-sm"><span>原操作编号</span><Input aria-label="原操作编号" autoComplete="off" value={operationRef} disabled={busy || !!operation} onChange={event => setOperationRef(event.target.value)}/></label>
      {operation ? <p role="status" className="text-xs text-muted-foreground">{status}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy || !operationRef.trim()} onClick={() => void perform("read")}>查询原操作</Button>
        {operation && (operation.status === "pending" || operation.status === "provider_unknown") ? <Button type="button" variant="outline" disabled={busy} onClick={() => void perform("resume")}>恢复原操作</Button> : null}
        {operation?.status === "applied" ? <Button type="button" disabled={busy} onClick={() => void perform("connect")}>同步并打开额度中心</Button> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  </details>;
}
