"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";

import { useAccountsChanged } from "@/lib/account-events";
import { readCurrentAccountId, readCurrentGroupId } from "@/lib/http-transport";
import type { SettingsViewModel } from "./settings-page";

type ModelReply = Awaited<ReturnType<typeof client.putModel>>;
type ProbeResult = { status: "ok" | "warn" | "fail"; detail: string };
export interface ModelTestOperation {
  readonly isCurrent: () => boolean;
  readonly saved: (reply: ModelReply) => void;
}
type BeforeTest = (operation: ModelTestOperation) => Promise<boolean | void>;

// Only public configuration fields: never retain a secret or secretReference.
// Mirrors the real settings route's DTO projection, including nullable baseUrl.
export function modelConfigurationIdentity(model: SettingsViewModel["model"]): string {
  return JSON.stringify([model.capability, model.provider, model.modelName, model.baseUrl,
    model.apiFormat, model.hasSecret, model.temperature]);
}
function savedIdentity(reply: ModelReply): string {
  const temperature = reply.settings?.temperature;
  return modelConfigurationIdentity({...reply, baseUrl: reply.baseUrl ?? "",
    temperature: typeof temperature === "number" ? temperature : 0.6});
}
function currentScope() {
  return {groupId: readCurrentGroupId(), accountId: readCurrentAccountId()};
}
function sameScope(a: ReturnType<typeof currentScope>, b: ReturnType<typeof currentScope>) {
  return a.groupId === b.groupId && a.accountId === b.accountId;
}

/** The default probe belongs to the stable region, not its keyed form instance. */
export function useModelConnectionTest(capability: string, configuration?: string, enabled = true) {
  const inFlight = React.useRef(false);
  const scopeVersion = React.useRef(0);
  const scope = React.useRef(currentScope());
  const currentConfiguration = React.useRef(configuration);
  const savedConfiguration = React.useRef<{version: number; identity: string} | null>(null);
  const allowed = React.useRef(enabled);
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [testing, setTesting] = React.useState(false);
  // [T-384] 三态:"warn" = 无法探测但也无法证伪配置(如 ASR 厂商无 /v1/models 端点)——
  // 诚实中间态,不当失败渲。旧二态响应无 status 字段 → 按 ok 推导,向后兼容。
  const [result, setResult] = React.useState<ProbeResult | null>(null);
  const invalidate = React.useCallback(() => {
    scopeVersion.current += 1;
    inFlight.current = false;
    savedConfiguration.current = null;
    setTesting(false);
    setResult(null);
  }, []);

  useAccountsChanged(React.useCallback(() => {
    const next = currentScope();
    if(sameScope(next, scope.current)) return;
    scope.current = next;
    invalidate();
  }, [invalidate]));

  React.useLayoutEffect(() => {
    allowed.current = enabled;
    if(enabled && configuration === currentConfiguration.current) return;
    currentConfiguration.current = configuration;
    const saved = savedConfiguration.current;
    if(enabled && saved && saved.version === scopeVersion.current && saved.identity === configuration) {
      // Only this operation's real PUT echo may keep the ongoing result.
      savedConfiguration.current = null;
      return;
    }
    // Invalidate the async owner before any late response can commit. Defer the
    // presentation reset until after this external configuration commit.
    const version = ++scopeVersion.current;
    inFlight.current = false;
    savedConfiguration.current = null;
    queueMicrotask(() => {
      if(!mounted.current || version !== scopeVersion.current) return;
      setTesting(false);
      setResult(null);
    });
  }, [configuration, enabled, invalidate]);

  const runTest = React.useCallback(async (beforeTest?: BeforeTest) => {
    if(inFlight.current || !allowed.current) return;
    const operationScope = currentScope();
    if(!sameScope(operationScope, scope.current)) {
      scope.current = operationScope;
      invalidate();
    }
    inFlight.current = true;
    const version = scopeVersion.current;
    const isCurrent = () => mounted.current && allowed.current &&
      version === scopeVersion.current && sameScope(operationScope, currentScope());
    setTesting(true);
    setResult(null);
    try {
      if(beforeTest) {
        const ready = await beforeTest({isCurrent, saved: reply => {
          if(isCurrent()) savedConfiguration.current = {version, identity: savedIdentity(reply)};
        }});
        if(!isCurrent()) return;
        if(ready === false) {
          setResult({ status: "fail", detail: "当前配置未保存，请检查必填项。" });
          return;
        }
      }
      const res = (await client.testModelConnection({
        params: { capability },
        query: undefined,
        body: undefined,
      })) as unknown as { ok: boolean; detail: string; status?: "ok" | "warn" | "fail" };
      if(!isCurrent()) return;
      setResult({ status: res.status ?? (res.ok ? "ok" : "fail"), detail: res.detail });
    } catch(err) {
      if(!isCurrent()) return;
      setResult({
        status: "fail",
        detail: err instanceof Error ? err.message : "测试请求失败,请重试",
      });
    } finally {
      if(version === scopeVersion.current) {
        inFlight.current = false;
        if(mounted.current) setTesting(false);
      }
    }
  }, [capability, invalidate]);

  return {testing, result, runTest, invalidate};
}

export type ModelConnectionTestSession = ReturnType<typeof useModelConnectionTest>;

export function TestConnectionButton({
  capability, slotPrefix, quotaHint, beforeTest, label = "测试连接", disabled = false, session,
}: {
  capability: string;
  /** data-slot 前缀,如 "model" | "multimodal-image"。 */
  slotPrefix: string;
  /** 额度提示(如生图/付费搜索会真实调用消耗少量额度);null = 不提示。 */
  quotaHint?: string | null;
  /** 主模型可先保存当前草稿，再测试刚保存的同一份配置。 */
  beforeTest?: BeforeTest;
  label?: string;
  disabled?: boolean;
  session?: ModelConnectionTestSession;
}) {
  const local = useModelConnectionTest(capability, undefined, !session);
  const {testing, result, runTest} = session ?? local;

  if (capability === "image.edit") {
    return <p className="text-xs text-muted-foreground" data-slot={`${slotPrefix}-test-unavailable`}>
      图片编辑暂无内置连接测试，不代表密钥失效；未执行图片编辑。
    </p>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {beforeTest
            ? "会先保存当前填写，再按正式调用方式测试"
            : "测试的是已保存的配置(改动请先保存)"}
          {quotaHint ? `;${quotaHint}` : ""}
        </span>
        <Button
          type="button"
          data-slot={`${slotPrefix}-test-connection`}
          variant="outline"
          size="sm"
          disabled={testing || disabled}
          onClick={() => void runTest(beforeTest)}
        >
          {testing ? "测试中…" : label}
        </Button>
      </div>
      {result ? (
        <p
          data-slot={`${slotPrefix}-test-result`}
          data-ok={result.status === "fail" ? "false" : "true"}
          data-status={result.status}
          className={
            result.status === "ok"
              ? "text-xs text-success"
              : result.status === "warn"
                ? "text-xs text-warning"
                : "text-xs text-destructive"
          }
        >
          {result.status === "ok"
            ? `✓ 连通:${result.detail}`
            : result.status === "warn"
              ? `⚠ ${result.detail}`
              : `✗ 失败:${result.detail}`}
        </p>
      ) : null}
    </div>
  );
}
