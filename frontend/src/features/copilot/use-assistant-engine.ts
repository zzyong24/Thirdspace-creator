"use client";

import * as React from "react";
import {localCodexStatusSchema} from "@creatoros/contract/execution-worker";
import {CURRENT_ACCOUNT_KEY, fetchCreatorApi, readCurrentAccountId} from "@/lib/http-transport";
import {
  subscribeAssistantEngine,
  readAssistantEnginePreference,serverAssistantEnginePreference,loadAssistantEngine,
  assistantEngineStatusEvent,
  readAssistantEngine,
  readModelRoutingPreference,serverModelRoutingPreference,subscribeModelRouting,loadModelRouting,
  recheckAssistantEngine,
} from "./assistant-engine";

type LocalCodexStatus = ReturnType<typeof localCodexStatusSchema.parse>;
type StatusRead = {key: string; checking: boolean; result: LocalCodexStatus | null};

function subscribeAccount(refresh: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === CURRENT_ACCOUNT_KEY) refresh();
  };
  window.addEventListener("creatoros:accounts-changed", refresh);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("creatoros:accounts-changed", refresh);
    window.removeEventListener("storage", storage);
  };
}

/** 偏好是原本地真值；状态仍由真实入口读取，界面迁移不创建新的执行器。 */
export function useAssistantEngine() {
  const legacyPreference=React.useSyncExternalStore(subscribeAssistantEngine,readAssistantEnginePreference,()=>serverAssistantEnginePreference);
  const routing=React.useSyncExternalStore(subscribeModelRouting,readModelRoutingPreference,()=>serverModelRoutingPreference);
  const v2=Boolean(routing.resource?.choices);
  const engine=v2?(routing.resource!.choices!.text==='codex'?'codex':'pi'):(routing.resource?.legacyExecutionEngine??legacyPreference.engine);
  const preference=routing.ready?{engine,ready:true,saving:routing.saving,error:routing.error}:{engine,ready:false,saving:routing.saving,error:routing.error};
  React.useEffect(()=>{void loadModelRouting();},[]);
  const accountId = React.useSyncExternalStore(subscribeAccount, readCurrentAccountId, () => null);
  const [refresh, requestRefresh] = React.useReducer(value => value + 1, 0);
  const [read, setRead] = React.useState<StatusRead | null>(null);
  const key = JSON.stringify([routing.scope,accountId, engine, refresh]);

  React.useEffect(() => {
    window.addEventListener(assistantEngineStatusEvent, requestRefresh);
    return () => window.removeEventListener(assistantEngineStatusEvent, requestRefresh);
  }, []);

  React.useEffect(() => {
    if (v2 || !routing.ready || engine !== "codex") return;
    const controller = new AbortController();
    let current = true;
    void Promise.resolve().then(async () => {
      if (!current) return;
      setRead({key, checking: true, result: null});
      try {
        const response = await fetchCreatorApi("/api/chat/engines", {signal: controller.signal});
        if (!response.ok) throw Error("本地编导状态未取得");
        const body = await response.json() as {engines?: unknown[]};
        const parsed = localCodexStatusSchema.safeParse(body.engines?.find(
          row => row && typeof row === "object" && (row as {engine?: string}).engine === "codex",
        ));
        if (!parsed.success) throw Error("本地编导状态未取得");
        if (current) setRead({key, checking: false, result: parsed.data});
      } catch {
        if (current) setRead({key, checking: false, result: {
          engine: "codex", installed: false, available: false, version: null,
          loginStatus: "unchecked", errorCode: "CODEX_STATUS_UNAVAILABLE",
        }});
      }
    });
    return () => {current = false; controller.abort();};
  }, [accountId, engine, key,v2,routing.ready]);

  const result = read?.key === key ? read.result : null;
  const checking = v2?routing.reading:engine === "codex" && (read?.key !== key || read.checking);
  const available = preference.ready&&!preference.saving&&(engine === "pi" || (!checking && !!result?.available));
  const status = preference.error?preference.error:!preference.ready?"正在读取引擎设置…":preference.saving?"正在保存引擎…":engine === "pi" ? "使用 CreatorOS 当前模型配置"
    : checking ? "正在检查本地 Codex…"
    : result?.available ? `本地 Codex 已连接${result.version ? ` · ${result.version}` : ""} · ${result.capabilities?.imageGeneration?"文本与生图可用":"文本可用，生图能力当前不可用"}`
    : result?.loginStatus === "unauthenticated" ? "本地 Codex 尚未登录，请先在 Codex 中登录"
    : result?.errorCode === "CODEX_STATUS_UNAVAILABLE" ? "本地 Codex 状态暂未核实"
    : "本地 Codex 当前不可用";

  const capability=(mode:string,name:string)=>routing.resource?.capabilities.find(row=>row.mode===mode&&row.capability===name);
  const text=capability('text','copilot.assist'),vision=capability('vision','copilot.assist');
  const canUse=(row:typeof text)=>Boolean(routing.ready&&!routing.saving&&(!row||row.status==='ready'||row.status==='unverified'));
  const textAvailable=v2?Boolean(routing.ready&&!routing.saving&&text?.status==='ready'):available,visionAvailable=v2?Boolean(routing.ready&&!routing.saving&&vision?.status==='ready'):available;
  const canSubmitText=v2?canUse(text):available,canSubmitVision=v2?canUse(vision):available;
  return {engine,preference,accountId,available:textAvailable,checking:v2?!routing.ready:checking,status:v2?(text?`文本：${({ready:'可用',not_configured:'未配置',unverified:'未核实',unavailable:'不可用'} as const)[text.status]}`:'文本状态未核实'):status,routing,v2,textAvailable,visionAvailable,canSubmitText,canSubmitVision,imageGeneration:capability('image','image.generate'),imageEditing:capability('image','image.edit'),recheck:v2?()=>void loadModelRouting(true):()=>{void loadModelRouting(true);recheckAssistantEngine();}};
}
