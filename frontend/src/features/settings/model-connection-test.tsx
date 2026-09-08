"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";

import { useAccountsChanged } from "@/lib/account-events";
import { readCurrentAccountId } from "@/lib/http-transport";
export function TestConnectionButton({
  capability,
  slotPrefix,
  quotaHint,
  beforeTest,
  label = "测试连接",
  disabled = false,
}: {
  capability: string;
  /** data-slot 前缀,如 "model" | "multimodal-image"。 */
  slotPrefix: string;
  /** 额度提示(如生图/付费搜索会真实调用消耗少量额度);null = 不提示。 */
  quotaHint?: string | null;
  /** 主模型可先保存当前草稿，再测试刚保存的同一份配置。 */
  beforeTest?: () => Promise<boolean | void>;
  label?: string;
  disabled?: boolean;
}) {
  const inFlight = React.useRef(false);
  const scopeVersion = React.useRef(0);
  const account = React.useRef(readCurrentAccountId());
  const mounted = React.useRef(false);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [testing, setTesting] = React.useState(false);
  // [T-384] 三态:"warn" = 无法探测但也无法证伪配置(如 ASR 厂商无 /v1/models 端点)——
  // 诚实中间态,不当失败渲。旧二态响应无 status 字段 → 按 ok 推导,向后兼容。
  const [result, setResult] = React.useState<{
    status: "ok" | "warn" | "fail";
    detail: string;
  } | null>(null);

  useAccountsChanged(React.useCallback(() => {
    const current = readCurrentAccountId();
    if(current === account.current) return;
    account.current = current;
    scopeVersion.current += 1;
    inFlight.current = false;
    setTesting(false);
    setResult(null);
  }, []));

  const runTest = React.useCallback(async () => {
    if(inFlight.current) return;
    inFlight.current = true;
    const accountId = readCurrentAccountId();
    const version = scopeVersion.current;
    const isCurrent = () => mounted.current && version === scopeVersion.current && accountId === readCurrentAccountId();
    setTesting(true);
    setResult(null);
    try {
      if(beforeTest) {
        const ready = await beforeTest();
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
  }, [beforeTest, capability]);

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
          onClick={() => void runTest()}
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

