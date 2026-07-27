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
 * 故 status 只在用户显式刷新时拉；最近结果/时间缓存在本机 localStorage，反复打开设置页
 * 不再逐站启动 Chromium。缓存只表示“上次检查”，绝不冒充实时真值。
 */

import * as React from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { handshakeHeaders } from "@/lib/handshake-client";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";

interface WebSession {
  domain: string;
  lastLoginAt: string | null;
  loggedIn?: boolean;
  checkedAt?: string;
}

interface CachedWebSessionStatus {
  loggedIn: boolean;
  checkedAt: string;
}

type WebSessionStatusCache = Record<string, CachedWebSessionStatus>;

const STATUS_STORAGE_KEY = "creatoros.settings.web-session-status.v1";
const LIST_BODY_ID = "web-session-vault-list";

async function callWebSession(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/web-session", {
    method: "POST",
    // [T-372 L2] 桌面壳启动级握手 token(loopback-guard 校验;web/dev 为空不带)。
    headers: { "content-type": "application/json", ...handshakeHeaders() },
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

function readStatusCache(): WebSessionStatusCache {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(STATUS_STORAGE_KEY) ?? "{}",
    ) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: WebSessionStatusCache = {};
    for (const [domain, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as CachedWebSessionStatus).loggedIn === "boolean" &&
        typeof (value as CachedWebSessionStatus).checkedAt === "string"
      ) {
        clean[domain] = value as CachedWebSessionStatus;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function writeStatusCache(cache: WebSessionStatusCache): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage 被禁用/空间不足时仅失去跨挂载缓存，不影响真实探测。
  }
}

function mergeCachedStatuses(rows: WebSession[]): WebSession[] {
  const cache = readStatusCache();
  return rows.map((session) => {
    const cached = cache[session.domain];
    return cached ? { ...session, ...cached } : session;
  });
}

export function WebSessionVaultCard() {
  const [sessions, setSessions] = React.useState<WebSession[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const [refreshProgress, setRefreshProgress] = React.useState<{
    done: number;
    total: number;
  } | null>(null);
  const [urlInput, setUrlInput] = React.useState("");
  const [busy, setBusy] = React.useState<"idle" | "loggingIn">("idle");
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [rowBusy, setRowBusy] = React.useState<Record<string, boolean>>({});
  // [T-221] 待确认登录:开窗后登录窗保持打开,等用户点「我登好了」。null = 无待确认窗。
  const [pendingLogin, setPendingLogin] = React.useState<{
    domain: string;
    confirming: boolean;
  } | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const data = (await callWebSession({ action: "list" })) as {
        sessions?: WebSession[];
      };
      const rows = Array.isArray(data.sessions) ? data.sessions : [];
      setSessions(mergeCachedStatuses(rows));
    } catch {
      // list 失败(无浏览器/transport race)→ 保持空列表,不误报。
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    void callWebSession({ action: "list" })
      .then((data) => {
        if (!alive) return;
        const rows = (data as { sessions?: WebSession[] }).sessions;
        setSessions(mergeCachedStatuses(Array.isArray(rows) ? rows : []));
      })
      .catch(() => {
        // list 失败(无浏览器/transport race)→ 保持空列表,不误报。
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const rememberStatus = React.useCallback(
    (domain: string, loggedIn: boolean, checkedAt = new Date().toISOString()) => {
      const cache = readStatusCache();
      cache[domain] = { loggedIn, checkedAt };
      writeStatusCache(cache);
      setSessions((prev) =>
        prev.map((session) =>
          session.domain === domain
            ? { ...session, loggedIn, checkedAt }
            : session,
        ),
      );
    },
    [],
  );

  const refreshAllStatuses = React.useCallback(async () => {
    if (sessions.length === 0 || refreshProgress) return;
    setFeedback(null);
    setRefreshProgress({ done: 0, total: sessions.length });
    let failed = 0;
    for (let index = 0; index < sessions.length; index += 1) {
      const session = sessions[index]!;
      try {
        const result = (await callWebSession({
          action: "status",
          domain: session.domain,
        })) as { loggedIn?: boolean };
        rememberStatus(session.domain, result.loggedIn === true);
      } catch {
        // 单站失败保留旧缓存，不把浏览器/网络故障冒充“需重登”。
        failed += 1;
      }
      setRefreshProgress({ done: index + 1, total: sessions.length });
    }
    setRefreshProgress(null);
    setFeedback(
      failed === 0
        ? `已检查 ${sessions.length} 个网站，结果已保存在本机。`
        : `已检查 ${sessions.length} 个网站，其中 ${failed} 个检查失败，已保留它们上次的状态。`,
    );
  }, [refreshProgress, rememberStatus, sessions]);

  // [T-221] 开窗登录:开窗即返(独立浏览器保持打开),等用户在窗口里登好后点「我登好了」。
  //   不再赌 cookie 名自动关(治「浏览器秒关」)。
  const openLogin = React.useCallback(
    async (url: string) => {
      if (!url || busy !== "idle" || pendingLogin) return;
      setBusy("loggingIn");
      setFeedback(null);
      try {
        const res = (await callWebSession({ action: "login", url })) as {
          domain?: string;
          pending?: boolean;
        };
        if (res.pending && res.domain) {
          setPendingLogin({ domain: res.domain, confirming: false });
          setFeedback(
            `已打开 ${res.domain} 的登录窗口 —— 在弹出的浏览器里自己登录(账密/扫码都行),登好后回到这里点「我登好了」。`,
          );
        } else {
          setFeedback("没能打开登录窗口,请重试。");
        }
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "打开登录窗口失败,请重试。");
      } finally {
        setBusy("idle");
      }
    },
    [busy, pendingLogin],
  );

  const login = React.useCallback(async () => {
    await openLogin(urlInput.trim());
  }, [openLogin, urlInput]);

  const relogin = React.useCallback(
    async (domain: string) => {
      await openLogin(`https://${domain}`);
    },
    [openLogin],
  );

  // [T-221] 用户点「我登好了」:关登录窗 + 持久化登录态,刷新徽标。
  const confirmLogin = React.useCallback(async () => {
    if (!pendingLogin || pendingLogin.confirming) return;
    const domain = pendingLogin.domain;
    setPendingLogin({ domain, confirming: true });
    try {
      const res = (await callWebSession({
        action: "loginConfirm",
        domain,
      })) as { loggedIn?: boolean };
      if (res.loggedIn) {
        rememberStatus(domain, true);
        setFeedback(`已登录 ${domain}。`);
        setUrlInput("");
      } else {
        rememberStatus(domain, false);
        setFeedback(`没能确认 ${domain} 的登录(窗口可能已关闭)——请重新打开登录窗口。`);
      }
      setPendingLogin(null);
      await refresh();
    } catch (err) {
      setPendingLogin({ domain, confirming: false });
      setFeedback(err instanceof Error ? err.message : "确认登录失败,请重试。");
    }
  }, [pendingLogin, refresh, rememberStatus]);

  // [T-221] 用户点「取消」:关登录窗,不留登录承诺。
  const cancelLogin = React.useCallback(async () => {
    if (!pendingLogin) return;
    const domain = pendingLogin.domain;
    setPendingLogin(null);
    setFeedback("已取消登录。");
    try {
      await callWebSession({ action: "loginCancel", domain });
    } catch {
      /* 取消失败(窗口可能已关)不阻断 UI */
    }
  }, [pendingLogin]);

  const remove = React.useCallback(
    async (domain: string) => {
      setRowBusy((p) => ({ ...p, [domain]: true }));
      try {
        await callWebSession({ action: "remove", domain });
        setSessions((prev) => prev.filter((p) => p.domain !== domain));
        const cache = readStatusCache();
        delete cache[domain];
        writeStatusCache(cache);
        setFeedback(`已移除 ${domain} 的登录态。`);
      } catch (err) {
        setFeedback(err instanceof Error ? err.message : "移除失败。");
      } finally {
        setRowBusy((p) => ({ ...p, [domain]: false }));
      }
    },
    [],
  );

  const connectedCount = sessions.filter((s) => s.loggedIn === true).length;
  const reloginCount = sessions.filter((s) => s.loggedIn === false).length;
  const uncheckedCount = sessions.length - connectedCount - reloginCount;
  const toggleExpanded = React.useCallback(() => {
    setExpanded((current) => !current);
  }, []);

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
          <div
            data-slot="web-session-list-shell"
            className="overflow-hidden rounded-lg border border-border bg-surface-subtle/50"
          >
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={LIST_BODY_ID}
                aria-label={expanded ? "收起网站列表" : "展开网站列表"}
                data-slot="web-session-list-toggle"
                onClick={toggleExpanded}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {expanded ? (
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                )}
                <span className="text-sm font-medium text-foreground">
                  {sessions.length} 个网站
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  已登录 {connectedCount} · 需重登 {reloginCount} · 未检查{" "}
                  {uncheckedCount}
                </span>
              </button>
              <button
                type="button"
                aria-label="刷新全部网站状态"
                data-slot="web-session-refresh-all"
                disabled={sessions.length === 0 || refreshProgress !== null}
                onClick={() => void refreshAllStatuses()}
                className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`size-3.5 ${refreshProgress ? "animate-spin" : ""}`}
                />
                {refreshProgress
                  ? `检查中 ${refreshProgress.done}/${refreshProgress.total}`
                  : "刷新状态"}
              </button>
            </div>
            <p className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
              显示的是上次检查结果；登录可能随网站过期，需要时再刷新。
            </p>
            <div
              id={LIST_BODY_ID}
              data-slot="web-session-list-body"
              hidden={!expanded}
              className="max-h-[26rem] overflow-y-auto border-t border-border p-2"
            >
              <ul className="flex flex-col gap-2" data-slot="web-session-list">
                {sessions.map((s) => (
                  <li
                    key={s.domain}
                    data-slot="web-session-row"
                    data-domain={s.domain}
                    className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {s.domain}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        上次登录 {formatWhen(s.lastLoginAt)}
                        {s.checkedAt
                          ? ` · 状态检查 ${formatWhen(s.checkedAt)}`
                          : " · 状态尚未检查"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
                          未检查
                        </Badge>
                      )}
                      <button
                        type="button"
                        data-slot="web-session-relogin"
                        disabled={
                          busy !== "idle" ||
                          pendingLogin !== null ||
                          rowBusy[s.domain]
                        }
                        onClick={() => void relogin(s.domain)}
                        className="inline-flex h-7 shrink-0 items-center rounded-control border border-border px-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
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
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
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
            disabled={busy !== "idle" || pendingLogin !== null}
            className="h-8 min-w-0 flex-1 rounded-control border border-border bg-surface px-2 text-sm text-foreground placeholder:text-text-subtle focus:border-brand focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            data-slot="web-session-login"
            disabled={busy !== "idle" || pendingLogin !== null || !urlInput.trim()}
            onClick={() => void login()}
            className="inline-flex h-8 shrink-0 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {busy === "loggingIn" ? "打开窗口中…" : "登录"}
          </button>
        </div>

        {/* [T-221] 待确认登录条:登录窗保持打开,用户登好后点「我登好了」才关窗持久化(治秒关)。 */}
        {pendingLogin ? (
          <div
            data-slot="web-session-login-confirm"
            data-domain={pendingLogin.domain}
            className="flex flex-wrap items-center gap-2 rounded-md border border-brand/40 bg-brand-soft/40 px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-xs text-foreground">
              在弹出的浏览器窗口里登录 <b>{pendingLogin.domain}</b>,登好后点这里 →
            </span>
            <button
              type="button"
              data-slot="web-session-login-confirm-btn"
              disabled={pendingLogin.confirming}
              onClick={() => void confirmLogin()}
              className="inline-flex h-7 shrink-0 items-center rounded-control bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {pendingLogin.confirming ? "确认中…" : "我登好了"}
            </button>
            <button
              type="button"
              data-slot="web-session-login-cancel-btn"
              disabled={pendingLogin.confirming}
              onClick={() => void cancelLogin()}
              className="inline-flex h-7 shrink-0 items-center rounded-control border border-border px-2 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
            >
              取消
            </button>
          </div>
        ) : null}

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
