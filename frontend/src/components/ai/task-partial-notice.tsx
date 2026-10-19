"use client";

export function TaskPartialNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <p data-slot="task-partial" role="status" className="text-sm leading-relaxed text-muted-foreground">
      本次任务部分完成。已保存实际结果；当前卡片暂无可采纳候选，请查看原对话或任务。
    </p>
  );
}
