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
  "material.screenshot": {
    name: "网页截图",
    purpose: "给公开 URL 真开浏览器截图,存进素材中心(真证据)",
  },
  "web.read": {
    name: "读网页正文",
    purpose: "带登录态读一个网页的正文全文(含需登录内容),存成逐字稿素材;超长内容按窗翻读",
  },
  // [T-253] 本机文件读取(任意路径 + 运行时确认卡 + 敏感 denylist 硬门)。
  "local.read": {
    name: "读本机文件",
    purpose: "经你确认后读本机文件/目录(敏感文件硬拒),内容直接进对话",
  },
  // [T-256a] 环境感知扩展:工具探测 + 工作区目录感知。
  "local.tools": {
    name: "探测本机工具",
    purpose: "查本机装没装 ffmpeg/node/python3/git 等工具,缺的诚实引导安装",
  },
  "local.workspace": {
    name: "列授权目录",
    purpose: "列你已「总是允许」的本地目录(工作区),再用读本机文件看里面",
  },
  "material.generate": {
    name: "AI 生成素材",
    purpose: "文生图/文生视频,生成 AI 素材候选,采纳后进素材中心",
  },
  // [T-271] 制作封面链 —— 硬锚立项核心信息/口播稿产结构化封面文案(过诚实门)+ 生图,采纳后绑进项目。
  "cover.generate": {
    name: "生成封面",
    purpose:
      "硬锚立项核心信息+口播稿产结构化封面方案(文案过诚实门、不编数字)并生图,采纳后绑进项目封面",
  },
  "intelligence.douyin.share": {
    name: "抖音分享建档",
    purpose: "持久归档抖音分享；仅在用户本轮明确授权时续接转写",
  },
  // [T-265] 论点树对话内真生成 —— 产 thesis_tree 候选,采纳后挂进稿面「论点骨架」面板。
  "planning.thesis": {
    name: "立论点树",
    purpose:
      "基于定位/选题/立项 brief/已搜素材生成一棵论点树(核心论点+支撑/证据/反驳),采纳后挂进稿面「论点骨架」面板、写脚本时作为依据",
  },
  "learning.capture": {
    name: "记录经验",
    purpose: "把对话里口述的经验整理成结构化经验卡,采纳后沉淀进飞轮",
  },
  "brief.fill": {
    name: "填选题卡",
    purpose: "把对话里聊的观众/目标/核心信息整理进选题卡候选",
  },
  "calibration.diagnose": {
    name: "编导诊断",
    purpose: "发布前逐维度盲评内容并给出优先修改建议",
  },
  "review.analyze": {
    name: "复盘提炼",
    purpose: "基于当前作品的真实数据与评论提炼可复用爆款要素",
  },
  // [T-385] 复盘无稿门的可执行动作:对话内一键对该作品发起单条逐字稿抓取(后台 1-3 分钟)。
  "project.transcribe": {
    name: "抓取逐字稿",
    purpose:
      "作品缺逐字稿时(复盘/拆解被无稿门拦),对该作品立即发起单条逐字稿抓取(后台约 1-3 分钟,完成后可重新拆解)",
  },
  "positioning.generate": {
    name: "生成定位提案",
    purpose: "结合账号画像产结构化定位提案卡,采纳可写入定位母版",
  },
  "knowledge.distill": {
    name: "知识蒸馏",
    purpose: "把粘贴的原文蒸馏成知识原子候选(观点/证据/金句/问题),采纳后进知识库",
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
  // [T-099b] 切片二:详情类(单实体全字段)。
  "context.project.detail": {
    name: "读取项目档案",
    purpose: "拉某项目全档:立项 brief/阶段/发布状态/产物索引/最新指标",
  },
  "context.positioning.detail": {
    name: "读取定位档案",
    purpose: "拉定位母版全档:9 facets/下游约束/当前陈述/账号画像",
  },
  "context.knowledge.detail": {
    name: "读取知识原子",
    purpose: "拉某条知识全档:正文/出处/标签/战绩/关联边",
  },
  // [T-099c] 切片三:全文类(产物清单 + 长文本窗口读取,事故二根治)。
  "context.artifacts": {
    name: "读取产物清单",
    purpose: "列某项目每类产物的 artifactType/当前版本/字数/更新时间",
  },
  "context.artifact.text": {
    name: "读取产物正文",
    purpose: "按窗口读某项目某类产物(脚本/逐字稿等)的正文全文",
  },
  "context.knowledge.text": {
    name: "读取知识全文",
    purpose: "按窗口读某条知识的长文正文(逐字稿/引用/笔记)",
  },
};

// [T-095] 调度采集任务类型的中文词表 —— 「最近任务/继续任务」等任务 feed 渲 taskType 时用,
// 与 AI 创作任务词表(features/copilot 的 TASK_TYPE_LABEL)互补:这里只收 scheduled.* 采集类。
// sub 描述账号/范围(采集类任务不挂单项目,任务卡副文显示它而不是无意义的「项目:—」)。
// 落统一词表文件(与 CHAT_TOOL_LABELS 同库),防止各 surface 再各自硬编码 op id。
export const SCHEDULED_TASK_TYPE_LABELS: Readonly<
  Record<string, { label: string; sub: string }>
> = {
  "scheduled.self.detail": {
    label: "作品明细采集",
    sub: "定时采集本账号作品明细",
  },
  "scheduled.comments": {
    label: "评论采集",
    sub: "定时采集本账号作品评论",
  },
  "scheduled.self.metrics": {
    label: "作品数据采集",
    sub: "定时采集本账号作品数据",
  },
};

/**
 * skillsBrief 每工具行数上限(SPEC §1.3 [gate-F1]:超出截断)。[T-099c] 从 20 提到 30;
 * [T-256a] 再提到 40:环境感知扩展(local.tools + local.workspace)后全工具集达 33(project
 * surface = 全量),原 30 会截断 project/topics 面末尾工具、破坏自感知一致性。自感知清单应覆盖
 * 全部可调工具(T-104 全放开语义 —— 模型对「能干什么」的自述须与真实工具集一致),留头量到 40。
 */
export const SKILLS_BRIEF_MAX_LINES = 40;

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
