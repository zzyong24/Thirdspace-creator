"use client";
import { boundedExceptionContext } from "@creatoros/contract";
import { useEffect } from "react";
import { fetchCreatorApi } from "./http-transport";
const seen = new WeakMap<Error, string>();
export function captureBrowserException(
  error: unknown,
  referenceId: string | null = null,
) {
  const actual =
    error instanceof Error ? error : new Error("浏览器发生未分类异常");
  if (seen.has(actual)) return;
  const eventId = crypto.randomUUID();
  seen.set(actual, eventId);
  const body = boundedExceptionContext({
    eventId,
    module: "ui" as const,
    code: "UNCLASSIFIED_EXCEPTION",
    occurredAt: new Date().toISOString(),
    referenceId:
      referenceId && /^[a-zA-Z0-9_.:-]{1,128}$/.test(referenceId)
        ? referenceId
        : null,
    stack: new TextDecoder().decode(
      new TextEncoder().encode(actual.stack ?? "").slice(0, 16000),
    ),
    message: new TextDecoder().decode(
      new TextEncoder().encode(actual.message).slice(0, 4000),
    ),
  });
  // 本地可信端口只写已授权现场，网络上传由唯一每日host排期。
  void fetchCreatorApi(
    "/api/v1/local/observability",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    },
    { includeCurrentAccount: false },
  )
    .then((response) => response.body?.cancel())
    .catch(() => {});
}
export function ObservabilityClient() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => captureBrowserException(event.error);
    const onRejection = (event: PromiseRejectionEvent) =>
      captureBrowserException(event.reason);
    let active: AbortController | null = null;
    let pendingOnline: boolean | null = null;
    let disposed = false;
    function flushConnectivity() {
      if (active || pendingOnline === null || disposed) return;
      const online = pendingOnline; pendingOnline = null;
      const controller = new AbortController(); active = controller;
      // 同时只发一个本地请求，后续变化合并为最新值，防止旧请求晚回写。
      void fetchCreatorApi("/api/v1/local/observability", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "connectivity", online }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
      }, { includeCurrentAccount: false }).then(response => response.body?.cancel()).catch(() => {}).finally(() => {
        if (active === controller) active = null;
        flushConnectivity();
      });
    }
    const onConnectivity = () => { pendingOnline = navigator.onLine; flushConnectivity(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("online", onConnectivity);
    window.addEventListener("offline", onConnectivity);
    onConnectivity();
    return () => {
      disposed = true; pendingOnline = null; active?.abort();
      window.removeEventListener("online", onConnectivity);
      window.removeEventListener("offline", onConnectivity);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
