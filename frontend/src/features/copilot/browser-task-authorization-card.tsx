"use client";
import * as React from "react";
export function BrowserTaskAuthorizationCard({
  taskId,
  suggestion,
  onSettled,
  authorized = false,
}: {
  authorized?: boolean;
  taskId: string;
  suggestion: unknown;
  onSettled: () => Promise<unknown>;
}) {
  const raw = suggestion as { allowedDomains?: unknown } | null;
  const [domains, setDomains] = React.useState(() =>
    Array.isArray(raw?.allowedDomains)
      ? raw.allowedDomains
          .filter((x): x is string => typeof x === "string")
          .join("\n")
      : "",
  );
  const [interaction, setInteraction] = React.useState(false),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState<string | null>(null);
  const request = React.useRef<{ key: string; body: string } | null>(null);
  async function decide(allow: boolean) {
    const authorization = allow
      ? {
          allowedDomains: domains
            .split(/[,\n]/)
            .map((x) => x.trim())
            .filter(Boolean),
          allowInteraction: interaction,
        }
      : null;
    const body = JSON.stringify(authorization);
    if (request.current?.body !== body)
      request.current = { key: crypto.randomUUID(), body };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/local/browser-task-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          authorized
            ? { taskId, action: "prepare" }
            : { taskId, authorization, idempotencyKey: request.current.key },
        ),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "授权未完成，请重试");
    } catch (e) {
      setError(e instanceof Error ? e.message : "授权未完成，请重试");
    } finally {
      await onSettled();
      setBusy(false);
    }
  }
  if (authorized)
    return (
      <div className="flex flex-col gap-2 text-[12px]">
        <p>浏览器选择已保存，任务尚未启动。</p>
        <button
          disabled={busy}
          onClick={() => void decide(false)}
          className="rounded-control border border-border px-3 py-1"
        >
          继续任务
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>
    );
  return (
    <div
      data-slot="browser-task-authorization"
      className="flex flex-col gap-2 text-[12px]"
    >
      <p>此任务希望使用浏览器。请核对网站范围，再决定是否允许。</p>
      <label className="flex flex-col gap-1">
        允许访问的网站（每行一个域名）
        <textarea
          aria-label="允许访问的网站"
          value={domains}
          onChange={(e) => setDomains(e.target.value)}
          disabled={busy}
          rows={3}
          className="rounded-md border border-border p-2"
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={interaction}
          disabled={busy}
          onChange={(e) => setInteraction(e.target.checked)}
        />
        允许在上述网站点击和填写
      </label>
      <p className="text-muted-foreground">
        默认只读。子域名需要单独列出；本次选择仅用于当前任务。
      </p>
      <div className="flex gap-2">
        <button
          disabled={busy || !domains.trim()}
          onClick={() => void decide(true)}
          className="rounded-control border border-border px-3 py-1"
        >
          允许并继续
        </button>
        <button
          disabled={busy}
          onClick={() => void decide(false)}
          className="rounded-control border border-border px-3 py-1"
        >
          不使用浏览器继续
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
