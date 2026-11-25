"use client";

import { useEffect, useState } from "react";
import {
  defaultEveryInfraHost,
  everyInfraHostSchema,
  type EveryInfraHost,
} from "@creatoros/contract/internal/everyinfra";
import { SectionCard } from "@/components/project/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { client } from "@/lib/contract-client";

const emptyInput = { params: undefined, query: undefined, body: undefined };
const mainlandHost: EveryInfraHost = "https://api-cn.everyinfra.com";

export function EveryInfraConfiguration() {
  const [configured, setConfigured] = useState(false);
  const [baseUrl, setBaseUrl] = useState<EveryInfraHost>(defaultEveryInfraHost);
  const [savedHost, setSavedHost] = useState<EveryInfraHost>(defaultEveryInfraHost);
  const [secret, setSecret] = useState("");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    client.getEveryInfra(emptyInput).then(result => {
      if (!active) return;
      setConfigured(result.configured);
      setBaseUrl(result.baseUrl);
      setSavedHost(result.baseUrl);
    }).catch(() => {
      if (active) setError("暂时无法读取万有引擎配置，请重新打开设置。");
    }).finally(() => {
      if (active) setPending(false);
    });
    return () => { active = false; };
  }, []);

  const canSave = !pending && (Boolean(secret.trim()) || (configured && baseUrl !== savedHost));

  async function update(remove: boolean) {
    if (remove ? pending || !configured : !canSave) return;
    setPending(true);
    setError("");
    try {
      const result = remove
        ? await client.deleteEveryInfra(emptyInput)
        : await client.putEveryInfra({
            ...emptyInput,
            body: { secret: secret.trim() || undefined, baseUrl },
          });
      setConfigured(result.configured);
      setBaseUrl(result.baseUrl);
      setSavedHost(result.baseUrl);
      setSecret("");
    } catch {
      setError(remove ? "万有引擎密钥未移除，请稍后重试。" : "万有引擎配置未保存，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  return (
    <SectionCard title="万有引擎" description="查询和取视频会计入你的万有引擎余额。">
      <form className="grid gap-3" onSubmit={event => {
        event.preventDefault();
        void update(false);
      }}>
        <p className="text-sm text-muted-foreground" role="status">
          {configured ? "已保存密钥" : pending ? "正在读取配置…" : "尚未配置"}
        </p>
        <div className="grid gap-2">
          <label className="text-sm" htmlFor="everyinfra-key">API Key</label>
          <Input
            id="everyinfra-key"
            type="password"
            autoComplete="new-password"
            disabled={pending}
            maxLength={4096}
            value={secret}
            onChange={event => setSecret(event.target.value)}
            placeholder={configured ? "输入新密钥以替换" : "填写万有引擎 API Key"}
          />
        </div>
        <div className="grid gap-2">
          <label className="text-sm" htmlFor="everyinfra-host">主机</label>
          <select
            id="everyinfra-host"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
            value={baseUrl}
            onChange={event => {
              const result = everyInfraHostSchema.safeParse(event.target.value);
              if (result.success) setBaseUrl(result.data);
            }}
          >
            <option value={defaultEveryInfraHost}>全球主机（默认）</option>
            <option value={mainlandHost}>中国大陆主机</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!canSave}>
            保存配置
          </Button>
          {configured && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => void update(true)}>
              移除密钥
            </Button>
          )}
          <a className="self-center text-sm text-primary" href="https://everyinfra.com" target="_blank" rel="noreferrer">
            获取 API Key ↗
          </a>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </SectionCard>
  );
}
