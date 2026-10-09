"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { describeUserError } from "@/lib/ai-error-humanize";
import { readCreationScope, creationScopeKey, type CreationScope } from "@/lib/creation-workspace-scope";

export interface WorkspaceInitialization {
  readonly ready: boolean;
  readonly phase: "loading" | "synchronizing" | "ready" | "error";
  readonly error: string | null;
  isReady(): boolean;
  preservesInitialAccount(accountId: string | null): boolean;
  begin(): void;
  synchronizing(): void;
  complete(scope: CreationScope): void;
  fail(message: string): void;
  registerRetry(retry: () => void): () => void;
  retry(): void;
}
export function isWorkspaceRecoveryPath(pathname: string) { return ["/accounts", "/settings"].some(path => pathname === path || pathname.startsWith(`${path}/`)); }
const Context = React.createContext<WorkspaceInitialization | null>(null);
export function useWorkspaceInitialization() { return React.useContext(Context); }

/** 只持首载就绪状态；范围与权限继续来自原cookie/session和backend。 */
export function WorkspaceInitializationProvider({ initialScope, children }: {
  initialScope: CreationScope; children: React.ReactNode;
}) {
  const initial = React.useRef(Object.freeze({...initialScope}));
  const ready = React.useRef(false);
  const retryRef = React.useRef<(() => void) | null>(null);
  const [state, setState] = React.useState<{phase: WorkspaceInitialization["phase"]; error: string | null}>({phase:"loading",error:null});
  const isReady = React.useCallback(() => ready.current, []);
  const preservesInitialAccount = React.useCallback((accountId: string | null) => Boolean(accountId) && !initial.current.groupId && initial.current.accountId === accountId, []);
  const begin = React.useCallback(() => { if (!ready.current) setState({phase:"loading",error:null}); }, []);
  const synchronizing = React.useCallback(() => { if (!ready.current) setState({phase:"synchronizing",error:null}); }, []);
  const complete = React.useCallback((scope: CreationScope) => {
    if (creationScopeKey(scope) !== creationScopeKey(readCreationScope())) return;
    ready.current = true;
    setState({phase:"ready",error:null});
  }, []);
  const fail = React.useCallback((message: string) => {
    const current = readCreationScope();
    // 仅沿认证会话冻结的同一调用意图继续；授权仍由backend逐次严格执行。
    const sameInitialIntent = Boolean(initial.current.groupId || initial.current.accountId) &&
      creationScopeKey(initial.current) === creationScopeKey(current);
    if (ready.current || sameInitialIntent) {
      ready.current = true;
      setState({phase:"ready",error:message});
    } else setState({phase:"error",error:message});
  }, []);
  const registerRetry = React.useCallback((retry: () => void) => {
    retryRef.current = retry;
    return () => { if (retryRef.current === retry) retryRef.current = null; };
  }, []);
  const retry = React.useCallback(() => retryRef.current?.(), []);
  const value = React.useMemo(() => ({ready:state.phase==="ready",phase:state.phase,error:state.error,isReady,preservesInitialAccount,begin,synchronizing,complete,fail,registerRetry,retry}),
    [state,isReady,preservesInitialAccount,begin,synchronizing,complete,fail,registerRetry,retry]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function WorkspaceInitializationBoundary({ children, surface = "page", allowRecovery = false }: {
  children: React.ReactNode; surface?: "page" | "overlay"; allowRecovery?: boolean;
}) {
  const initialization = useWorkspaceInitialization();
  const pathname = usePathname() ?? "/";
  const recovery = allowRecovery && isWorkspaceRecoveryPath(pathname);
  if (!initialization || initialization.ready || recovery) return children;
  if (surface === "overlay") return null;
  if (initialization.phase === "error") return <section role="alert" data-testid="workspace-initialization-error" className="flex min-h-64 flex-col items-start gap-4 rounded-panel border border-border bg-surface p-6">
    <p className="text-sm text-foreground">工作区暂时未能打开。</p>
    <p className="text-sm text-muted-foreground">{describeUserError(initialization.error, "工作区页面暂不可用，请重试。")}</p>
    <div className="flex flex-wrap gap-3"><Button onClick={initialization.retry}>重试打开工作区</Button><Button variant="outline" asChild><Link href="/accounts">账号组与绑定账号</Link></Button><Button variant="outline" asChild><Link href="/settings">设置</Link></Button></div>
  </section>;
  return <section role="status" aria-label="正在打开工作区" data-testid="workspace-initialization-loading" className="flex min-h-64 flex-1 flex-col gap-5 p-6">
    <p className="text-sm text-muted-foreground">正在打开工作区…</p>
    <div aria-hidden="true" className="h-7 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none" />
    <div aria-hidden="true" className="h-40 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
  </section>;
}
