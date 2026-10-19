"use client";

import * as React from "react";
import {CheckCircle2,FileCheck2,Clock3,LoaderCircle,TriangleAlert,ShieldAlert,HelpCircle} from "lucide-react";
import {readChatToolOutcome} from "./chat-tool-outcome";
const states={read:{label:"读取完成",Icon:CheckCircle2,color:"text-success"},candidate:{label:"候选待采用",Icon:FileCheck2,color:"text-brand"},queued:{label:"已排队",Icon:Clock3,color:"text-muted-foreground"},running:{label:"执行中",Icon:LoaderCircle,color:"text-brand"},completed:{label:"操作已确认",Icon:CheckCircle2,color:"text-success"},partial:{label:"部分完成",Icon:TriangleAlert,color:"text-warning"},error:{label:"未完成",Icon:TriangleAlert,color:"text-error"},blocked:{label:"需要处理",Icon:ShieldAlert,color:"text-warning"},unknown:{label:"结果待核对",Icon:HelpCircle,color:"text-warning"}};

/** 工具原始结果保留在消息中，仅在用户展开详情时生成展示摘要。 */
export const ChatToolTrace = React.memo(function ChatToolTrace({
  label, input, output,
}: {
  label: string;
  input: unknown;
  output: unknown;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const outcome=readChatToolOutcome(output),state=states[outcome.phase],Icon=state.Icon;
  const summary = React.useMemo(() => expanded
    ? outcome.blocksData?`${state.label}\n原因 ${outcome.reason}\n下一步 ${outcome.recovery}`:`入参 ${JSON.stringify(input ?? {}, null, 1).slice(0, 400)}\n结果 ${JSON.stringify(output, null, 1).slice(0, 800)}`
    : null, [expanded, input, output,outcome.blocksData,outcome.reason,outcome.recovery,state.label]);
  const total = (outcome.data as { total?: unknown } | null)?.total;
  return (
    <details
      data-slot="copilot-tool-trace"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="mt-1 rounded-md border border-border/60 bg-surface-subtle/40 px-2.5 py-1.5"
    >
      <summary className="cursor-pointer select-none text-xs leading-relaxed text-muted-foreground">
        <Icon aria-hidden="true" className={`mr-1.5 inline size-3.5 align-text-bottom ${state.color}${outcome.phase==="running"?" animate-spin":""}`}/>
        <span className={state.color}>{state.label}</span> · {label}
        {!outcome.blocksData&&typeof total === "number" ? `（共 ${total} 条）` : ""}
      </summary>
      {expanded && <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-relaxed text-text-subtle">{summary}</pre>}
    </details>
  );
});
