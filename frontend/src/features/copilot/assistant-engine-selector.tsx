"use client";

import {writeAssistantEngine, type AssistantEngine} from "./assistant-engine";
import {useAssistantEngine} from "./use-assistant-engine";

/** 选择只在设置卡中展示；聊天直接订阅同一偏好和真实可用状态。 */
export function AssistantEngineSelector() {
  const {engine, checking, status, recheck} = useAssistantEngine();
  return <div className="flex w-full flex-col gap-3">
    <select id="assistant-engine" aria-label="编导引擎" value={engine}
      onChange={event => writeAssistantEngine(event.target.value as AssistantEngine)}
      className="h-10 w-full max-w-xs rounded-control border border-border bg-surface px-3 text-sm text-foreground">
      <option value="pi">CreatorOS</option>
      <option value="codex">本地 Codex</option>
    </select>
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className="text-sm text-muted-foreground">{status}</p>
      {engine === "codex" && <button type="button" disabled={checking} onClick={recheck}
        className="inline-flex min-h-10 items-center rounded-control border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-subtle disabled:opacity-50">
        重新检查
      </button>}
    </div>
  </div>;
}
