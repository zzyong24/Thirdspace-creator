// [T-077c] Copilot 对话工具的单一中文词表(SPEC 2026-07-03 copilot-skill-native §1.3)。
//
// 两个消费方共用同一份词表(单一真值,防两处漂移):
//   1. client:features/copilot/ai-copilot-content.tsx 的工具 trace 行(「正在调用/已调用 中文名」)
//      —— 原 TOOL_TRACE_LABELS 抽到这里(server 文件不宜 import client 组件文件,故落纯常量 lib)。
//   2. server:server/ai/chat-runner.ts 的 skillsBrief(技能自感知:注入 chat system,
//      让模型能如实回答「你能干什么」并在对话中主动建议)。
//
// 纯常量、无 "use client" / "server-only" 标记 —— 两侧都可安全 import。
// 覆盖全部 chatbox.* 白名单工具(ai-worker prompt/templates/chatbox-turn + chatbox-surfaces);
// 新增白名单工具时在此补一行(缺词表时 trace 回落原名、skillsBrief 回落「(工具)」)。

export interface ChatToolLabel {
  /** 中文名(trace 行 + skillsBrief 行标题)。 */
  readonly name: string;
  /** 一句话用途(skillsBrief 行内容)。 */
  readonly purpose: string;
}

/** 全部 chatbox 白名单工具的中文名 + 一句话用途。 */
export const CHAT_TOOL_LABELS: Readonly<Record<string, ChatToolLabel>> = {
  "topic.generate": {
    name: "AI 出题",
    purpose: "按你的定位与真实依据(观众评论/知识库)产一批选题候选",
  },
  "topic.enrich": {
    name: "补全选题卡",
    purpose: "把一条选题(标题+角度)补全成结构化选题卡",
  },
  "script.hooks": {
    name: "生成 HOOK 候选",
    purpose: "产 4 个切角不同的开场钩子候选,可逐条写入稿面",
  },
  "script.draft": {
    name: "起草整稿脚本",
    purpose: "按定位与选题起草分镜口播整稿,可一键写入稿面",
  },
  "material.gather": {
    name: "搜集素材",
    purpose: "围绕主题搜一批可用素材(案例/数据/金句)",
  },
  "learning.capture": {
    name: "记录经验",
    purpose: "把对话里口述的经验整理成结构化经验卡,采纳后沉淀进飞轮",
  },
  "calibration.diagnose": {
    name: "编导诊断",
    purpose: "发布前逐维度盲评内容并给出优先修改建议",
  },
  "review.analyze": {
    name: "复盘提炼",
    purpose: "基于当前作品的真实数据与评论提炼可复用爆款要素",
  },
  "positioning.generate": {
    name: "生成定位提案",
    purpose: "结合账号画像产结构化定位提案卡,采纳可写入定位母版",
  },
  "context.projects": {
    name: "读取项目库",
    purpose: "实时拉取你最近的项目/作品清单",
  },
  "context.knowledge": {
    name: "检索知识库",
    purpose: "按关键词搜你的知识库条目",
  },
  "context.materials": {
    name: "检索素材库",
    purpose: "按关键词搜你的素材库资产",
  },
  "context.comments": {
    name: "读取观众评论",
    purpose: "拉取你作品下的真实观众评论",
  },
};

/** skillsBrief 每工具行数上限(SPEC §1.3 [gate-F1]:超出截断)。 */
export const SKILLS_BRIEF_MAX_LINES = 20;

/**
 * [T-077c gate-F1] 技能清单 facet:当前 surface 白名单内每工具一行
 * 「中文名(工具名):一句话用途」,行数=白名单工具数、上限 20 超出截断。
 * 缺词表的工具诚实回落「(工具)」名,不臆造用途。
 */
export function buildSkillsBrief(whitelist: readonly string[]): string {
  return whitelist
    .slice(0, SKILLS_BRIEF_MAX_LINES)
    .map((id) => {
      const label = CHAT_TOOL_LABELS[id];
      return label
        ? `${label.name}(${id}):${label.purpose}`
        : `${id}(${id}):暂无用途说明`;
    })
    .join("\n");
}
