"use client";

/**
 * [T-217a] Web Session Vault 管理面板(SPEC §2.1 能力 C)。
 *
 * 列已保存的网站登录态(域名 + 上次登录时间 + 状态徽标)/ 重新登录 / 移除;底部输入框粘一个
 * 网站链接「登录」→ 弹**独立 Chromium** 让用户自己登录(账密/扫码/SSO 都行,系统不碰凭据)→
 * 落 `.auth/web/<domain>/` 持久 profile。登录态只在本机,绝不外传。
 *
 * 全走 POST /api/web-session(action 分派 list/login/status/remove)—— 保管库无 DB 层,不走
 * dispatch 契约(同 /api/knowledge/* 逃生口)。登录/探针是 headed/headless 起浏览器的重操作,
 * 故 status 按需拉、login 阻塞至成功/超时(UI 显 loading)。
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";

interface WebSession {
  domain: string;
  lastLoginAt: string | null;
  loggedIn?: boolean; // 客户端按需探针填充(list 不带,避免逐站起浏览器)
}

async function callWebSession(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/web-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : `请求失败(${res.status})`,
    );
  }
  return data;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "未知时间";
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function WebSessionVaultCard() {
  const [sessions, setSessions] = React.useState<WebSession[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [urlInput, setUrlInput] = React.useState("");
  const [busy, setBusy] = React.useState<"idle" | "loggingIn">("idle");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [rowBusy, setRowBusy] = React.useState<Record<string, boolean>>({});

  const refresh = React.useCallback(async () => {
    try {
      const data = (await callWebSession({ action: "list" })) as {
        sessions?: WebSession[];
      };
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch {
      // list 失败(无浏览器/transport race)→ 保持空列表,不误报。
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // 挂载后逐站拉一次被动探针(headless,不弹窗),把徽标翻真。逐站串行避免一次起 N 个浏览器。
  React.useEffect(() => {
    if (!loaded || sessions.length === 0) return;
    let alive = true;
    void (async () => {
      for (const s of sessions) {
        if (typeof s.loggedIn === "boolean") continue;
        try {
          const st = (await callWebSession({
            action: "status",
            domain: s.domain,
          })) as { loggedIn?: boolean };
          if (!alive) return;
          setSessions((prev) =>
            prev.map((p) =>
              p.domain === s.domain ? { ...p, loggedIn: st.loggedIn === true } : p,
            ),
          );
        } catch {
          /* 探针失败:徽标保持未知,不误报 */
        }
      }
    })();
    return () => {
      alive = false;
    };
    // 只在 domain 集合变化时重新探针(loaded 翻真 / 新增站点)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, sessions.map((s) => s.domain).join(",")]);

  const login = React.useCallback(async () => {
    const url = urlInput.trim();
    if (!url || busy !== "idle") return;
    setBusy("loggingIn");
    setFeedback("已弹出登录窗口 —— 在打开的浏览器里完成登录,登好后这里会自动更新…");
    try {
      const res = (await callWebSession({ action: "login", url })) as {
        domain?: string;
        loggedIn?: boolean;
      };
      if (res.loggedIn) {
        setFeedback(`已登录 ${res.domain}。`);
        setUrlInput("");
      } else {
        setFeedback("未检测到登录(可能超时/未完成)——请重试,在弹出的窗口里完成登录。");
      }
      await refresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "登录失败,请重试。");
    } finally {
      setBusy("idle");
    }
  }, [urlInput, busy, refresh]);

  const relogin = React.useCallback(
    async (domain: string) => {
      if (busy !== "idle") return;
      setBusy("loggingIn");
      setFeedback(`已弹出 ${domain} 登录窗口 —— 在浏览器里完成登录…`);
      try {
        await callWebSession({ action: "login", url: `https://${domain}` });
        await refresh();
        setFeedback(`已重新登录 ${domain}。`);
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "重新登录失败。");
      } finally {
        setBusy("idle");
      }
    },
    [busy, refresh],
  );

  const remove = React.useCallback(
    async (domain: string) => {
      setRowBusy((p) => ({ ...p, [domain]: true }));
      try {
        await callWebSession({ action: "remove", domain });
        setSessions((prev) => prev.filter((p) => p.domain !== domain));
        setFeedback(`已移除 ${domain} 的登录态。`);
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "移除失败。");
      } finally {
        setRowBusy((p) => ({ ...p, [domain]: false }));
      }
    },
    [],
  );

  return (
    <SectionCard
      title="网站登录保管库"
      description="登录一次网站,编导就能读你登录后才看到的正文（ChatGPT 分享 / 知乎 / 公众号等）。登录态只存本机、绝不外传。"
    >
      <div data-slot="web-session-vault" className="flex flex-col gap-3">
        {loaded && sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            还没登录过任何网站。粘一个网站链接登录一次,之后编导读它的内容就能带上登录态。
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-slot="web-session-list">
            {sessions.map((s) => (
              <li
                key={s.domain}
                data-slot="web-session-row"
                data-domain={s.domain}
                className="flex items-center gap-3 rounded-md border border-border bg-surface-subtle p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">
                    {s.domain}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    上次登录 {formatWhen(s.lastLoginAt)}
                  </span>
                </div>
                {s.loggedIn === true ? (
                  <Badge
                    variant="outline"
                    data-slot="web-session-status"
                    data-connected="true"
                    className="border-success/40 bg-success-soft text-success"
                  >
                    已登录
                  </Badge>
                ) : s.loggedIn === false ? (
                  <Badge
                    variant="outline"
                    data-slot="web-session-status"
                    data-connected="false"
                    className="border-warning/40 bg-warning/10 text-warning"
                  >
                    需重登
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    data-slot="web-session-status"
                    className="border-border bg-surface text-muted-foreground"
                  >
                    检测中…
                  </Badge>
                )}
                <button
                  type="button"
                  data-slot="web-session-relogin"
                  disabled={busy !== "idle" || rowBusy[s.domain]}
                  onClick={() => void relogin(s.domain)}
                  className="inline-flex h-7 shrink-0 items-center rounded-control border border-border px-2 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                >
                  重新登录
                </button>
                <button
                  type="button"
                  data-slot="web-session-remove"
                  disabled={rowBusy[s.domain]}
                  onClick={() => void remove(s.domain)}
                  className="inline-flex h-7 shrink-0 items-center rounded-control border border-destructive/40 px-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-2">
          <input
            type="url"
            inputMode="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void login();
            }}
            placeholder="粘一个网站链接(如 https://chatgpt.com)"
            data-slot="web-session-url-input"
            disabled={busy !== "idle"}
            className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-foreground placeholder:text-text-subtle focus:border-brand focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            data-slot="web-session-login"
            disabled={busy !== "idle" || !urlInput.trim()}
            onClick={() => void login()}
            className="inline-flex h-8 shrink-0 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {busy === "loggingIn" ? "登录中…" : "登录"}
          </button>
        </div>

        {feedback ? (
          <p
            data-slot="web-session-feedback"
            className="text-xs text-muted-foreground"
          >
            {feedback}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}
