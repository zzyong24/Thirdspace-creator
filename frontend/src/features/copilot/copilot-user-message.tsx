import * as React from "react";

const POSITIONING_DISCOVERY_PREFIX = "【定位前采已完成】";

export function CopilotUserMessageText({ text }: { readonly text: string }) {
  if (text.trimStart().startsWith(POSITIONING_DISCOVERY_PREFIX)) {
    return (
      <details
        data-slot="copilot-message-text"
        className="min-w-0 max-w-full rounded-lg border border-brand/15 bg-brand-soft px-3 py-2 text-sm text-foreground"
      >
        <summary className="cursor-pointer select-none font-medium leading-6 text-foreground marker:text-brand">
          定位前采包 · 点击展开完整答案与来源
        </summary>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          完整内容已保留；展开后可查看全部选项、补充说明和公开参考。
        </p>
        <pre className="mt-2 max-h-72 min-w-0 max-w-full overflow-x-hidden overflow-y-auto whitespace-pre-wrap rounded-md bg-surface/70 p-2 font-sans text-xs leading-5 [overflow-wrap:anywhere]">
          {text}
        </pre>
      </details>
    );
  }

  return (
    <span
      data-slot="copilot-message-text"
      className="block min-w-0 max-w-full whitespace-pre-wrap rounded-lg bg-brand-soft px-3 py-2 text-sm leading-[1.7] text-foreground [overflow-wrap:anywhere]"
    >
      {text}
    </span>
  );
}
