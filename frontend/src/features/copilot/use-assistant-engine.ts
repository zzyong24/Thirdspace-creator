"use client";

import * as React from "react";
import {localCodexStatusSchema} from "@creatoros/contract/execution-worker";
import {CURRENT_ACCOUNT_KEY, fetchCreatorApi, readCurrentAccountId} from "@/lib/http-transport";
import {
  subscribeAssistantEngine,
  assistantEngineStatusEvent,
  readAssistantEngine,
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
  const engine = React.useSyncExternalStore(subscribeAssistantEngine, readAssistantEngine, () => "pi" as const);
  const accountId = React.useSyncExternalStore(subscribeAccount, readCurrentAccountId, () => null);
  const [refresh, requestRefresh] = React.useReducer(value => value + 1, 0);
  const [read, setRead] = React.useState<StatusRead | null>(null);
  const key = JSON.stringify([accountId, engine, refresh]);

  React.useEffect(() => {
    window.addEventListener(assistantEngineStatusEvent, requestRefresh);
    return () => window.removeEventListener(assistantEngineStatusEvent, requestRefresh);
  }, []);

  React.useEffect(() => {
    if (engine !== "codex") return;
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
  }, [accountId, engine, key]);

  const result = read?.key === key ? read.result : null;
  const checking = engine === "codex" && (read?.key !== key || read.checking);
  const available = engine === "pi" || (!checking && !!result?.available);
  const status = engine === "pi" ? "使用 CreatorOS 当前模型配置"
    : checking ? "正在检查本地 Codex…"
    : result?.available ? `本地 Codex 文本会话已连接${result.version ? ` · ${result.version}` : ""}（工具执行未验证）`
    : result?.loginStatus === "unauthenticated" ? "本地 Codex 尚未登录，请先在 Codex 中登录"
    : result?.errorCode === "CODEX_STATUS_UNAVAILABLE" ? "本地 Codex 状态暂未核实"
    : "本地 Codex 当前不可用";

  return {engine, accountId, available, checking, status, recheck: recheckAssistantEngine};
}
