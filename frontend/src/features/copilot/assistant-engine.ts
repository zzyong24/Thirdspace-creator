export type AssistantEngine = "pi" | "codex";
const key = "creatoros:assistant-engine:v1";
let sessionFallback: AssistantEngine | null = null;
export const assistantEngineEvent = "creatoros:assistant-engine-change";
export const assistantEngineStatusEvent = "creatoros:assistant-engine-status-refresh";

export function readAssistantEngine(): AssistantEngine {
  if (typeof window === "undefined") return "pi";
  if (sessionFallback !== null) return sessionFallback;
  try {return window.localStorage.getItem(key) === "codex" ? "codex" : "pi";}
  catch {return "pi";}
}

export function writeAssistantEngine(engine: AssistantEngine) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, engine);
    sessionFallback = null;
  } catch {
    // 写入失败也落实当前窗口内的明确选择；刷新后的持久化不能伪装成功。
    sessionFallback = engine;
  }
  window.dispatchEvent(new CustomEvent(assistantEngineEvent, {detail: engine}));
}

export function subscribeAssistantEngine(refresh: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === key) {
      // 另一个窗口的新选择取代当前窗口保存失败的旧选择。
      sessionFallback = null;
      refresh();
    }
  };
  window.addEventListener(assistantEngineEvent, refresh);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(assistantEngineEvent, refresh);
    window.removeEventListener("storage", storage);
  };
}

/** 设置中的重新检查同时使已打开的编导重新读取真实状态。 */
export function recheckAssistantEngine() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(assistantEngineStatusEvent));
}
