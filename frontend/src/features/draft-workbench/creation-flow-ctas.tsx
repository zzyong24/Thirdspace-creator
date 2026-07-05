"use client";

import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDraftChatRequest } from "./draft-chat-request";

// [T-127] 稿面「创作流引导」CTA 行 —— 把原本只藏在 Copilot 里的「素材搜集 / 立论点」两步显性化到
// 稿面(选题卡与脚本区之间),对应用户拍板的创作链:选题 → 搜素材(联网)→ 立论点(基于素材)→
// 写脚本。点一下即把话术自动发进右栏常驻编导对话(复用 T-108 openChat/autoSend,不开全局弹层)。
//
// 半自动(决策①):按钮 = 用户一键授权,后台真跑(素材搜集走 T-126 真联网检索;论点走
// planning.thesis 论点树)。不全自动(省额度、人出判断),不去别页手动(内嵌当前稿面)。
// 论点树采纳后经 CreativeContext.thesisBrief 自动喂进写脚本 facet(SEAM 已通,T-127d),脚本有据可依。

export function CreationFlowCtas() {
  const { openChat } = useDraftChatRequest();

  return (
    <section
      data-slot="creation-flow-ctas"
      aria-label="创作流引导"
      className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface-subtle px-3 py-2"
    >
      <span className="text-xs text-text-subtle">
        写之前先备料:
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() =>
          openChat({
            functionKey: "research.gather_material",
            prefill:
              "围绕这条内容的主题,联网搜集一批可用素材(案例、数据、金句),给出来源。",
            autoSend: true,
          })
        }
      >
        <Search className="size-3.5" />
        搜素材(联网)
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 text-xs"
        onClick={() =>
          openChat({
            functionKey: "planning.thesis",
            prefill:
              "基于选题、我的定位和已搜到的素材,帮我立一棵论点树:核心论点 + 支撑/证据/反驳分支。",
            autoSend: true,
          })
        }
      >
        <Sparkles className="size-3.5" />
        立论点
      </Button>
      <span className="text-[11px] text-text-subtle">
        —— 先搜素材、再基于素材立论点,写出来的脚本才有据可依
      </span>
    </section>
  );
}
