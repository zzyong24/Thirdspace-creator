"use client";

import * as React from "react";

/** 工具原始结果保留在消息中，仅在用户展开详情时生成展示摘要。 */
export const ChatToolTrace = React.memo(function ChatToolTrace({
  label, input, output,
}: {
  label: string;
  input: unknown;
  output: unknown;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const summary = React.useMemo(() => expanded
    ? `入参 ${JSON.stringify(input ?? {}, null, 1).slice(0, 400)}\n结果 ${JSON.stringify(output, null, 1).slice(0, 800)}`
    : null, [expanded, input, output]);
  const total = (output as { total?: unknown } | null)?.total;
  return (
    <details
      data-slot="copilot-tool-trace"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="mt-1 rounded-md border border-border/60 bg-surface-subtle/40 px-2.5 py-1.5"
    >
      <summary className="cursor-pointer select-none text-xs text-muted-foreground">
        <span className="text-success">✓</span> 已调用 {label}
        {typeof total === "number" ? `（共 ${total} 条）` : ""}
      </summary>
      {expanded && <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-text-subtle">{summary}</pre>}
    </details>
  );
});
