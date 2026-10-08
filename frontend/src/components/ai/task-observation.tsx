"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/** 页面观察结束只暂停读取；原任务执行权与编号始终由后台持有。 */
export function useTaskObservation(identity?: string | null) {
  const [state, setState] = React.useState({ paused: false, identity });
  const paused = state.paused && state.identity === identity;
  const pendingRef = React.useRef<((resume: boolean) => void) | null>(null);
  const generationRef = React.useRef(0);
  const mountedRef = React.useRef(false);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingRef.current?.(false);
      pendingRef.current = null;
    };
  }, [identity]);
  const pause = React.useCallback(() => {
    if (!mountedRef.current) return Promise.resolve(false);
    setState({ paused: true, identity });
    return new Promise<boolean>((resolve) => { pendingRef.current = resolve; });
  }, [identity]);
  const resume = React.useCallback(() => {
    const resolve = pendingRef.current;
    pendingRef.current = null;
    setState(current => ({ ...current, paused: false }));
    resolve?.(true);
  }, []);
  const capture = React.useCallback(() => {
    const generation = generationRef.current;
    return () => mountedRef.current && generationRef.current === generation;
  }, []);
  return { paused, pause, resume, capture };
}

export function TaskObservationNotice({ paused, resume }: {
  paused: boolean;
  resume: () => void;
}) {
  if (!paused) return null;
  return (
    <div data-slot="task-observation-paused" className="flex flex-col items-start gap-2" role="status">
      <p className="text-sm text-muted-foreground">后台任务尚未返回最终结果，页面已暂停自动查询。</p>
      <Button type="button" variant="outline" onClick={resume}>继续查询原任务</Button>
    </div>
  );
}
