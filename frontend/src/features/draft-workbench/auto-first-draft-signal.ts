/**
 * 批次2-3（月明 2026-11-10）：脚本页进来时稿面为空 → 自动起草初稿并自动写入稿面。
 *
 * 两端靠这个极小的信号对齐：
 *  - 稿面（AutoFirstDraft）发起 script.draft 时 mark(projectId)；
 *  - 对话里的整稿卡在候选可采纳时 consume(projectId)，命中才自动写入。
 * 只在本窗口内存里记（10 分钟内有效），历史消息重放不会自动写入。
 * 与 B6 的未保存/恢复逻辑兼容：只要稿面有未保存修改或正在保存，就既不自动起草也不自动写入，
 * 写入仍走原「采纳写入稿面」路径（confirmTask → 新版本 → 编辑器 setContent 同步已保存版本）。
 */
import { listForegroundActivities } from "@/lib/foreground-activity";

const TTL_MS = 10 * 60 * 1000;
const pending = new Map<string, number>();

export function markAutoFirstDraft(projectId: string, now = Date.now()): void {
  pending.set(projectId, now);
}

/** 命中且未过期才返回 true，并立即清除（每次自动起草只自动写入一次）。 */
export function consumeAutoFirstDraft(projectId: string | null | undefined, now = Date.now()): boolean {
  if (!projectId) return false;
  const at = pending.get(projectId);
  if (at === undefined) return false;
  pending.delete(projectId);
  return now - at <= TTL_MS;
}

/** 稿面是否有未保存修改或正在保存（与版本恢复的守卫同一判据）。 */
export function scriptEditorBusy(): boolean {
  return listForegroundActivities().some((label) => /(脚本|分镜脚本).*(未保存的修改|正在保存)/.test(label));
}

export const autoFirstDraftStorageKey = (projectId: string) => `creatoros:auto-first-draft:${projectId}`;

export function resetAutoFirstDraftForTest(): void {
  pending.clear();
}
