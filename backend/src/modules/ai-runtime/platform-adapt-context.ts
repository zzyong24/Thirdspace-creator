import type { RequestContext } from "@creatoros/contract";
import type { PlatformAdaptOutput } from "@creatoros/ai-worker";
import type { RecordCandidateInput } from "../ai/ai.service";
import { assembleCreativeContext,type ContextDeps,type CreativeContext } from "./creative-context";

export interface PlatformDraft {
  platform: string;
  title: string;
  body: string;
  tags: string[];
  coverIdea: string;
  // L6 对齐 cheat-package:该条草稿过发布审核 SOP 的结论(命中了什么 + 怎么改的)。
  // 硬规则已在 draft 本体改成合规版,这里只记改动;经验项记建议。前端发布页据此显审核结论。
  auditFlags: string[];
}

// Default fan-out when the caller names no platforms — the four 编导 surfaces. "wechat"
// here is the agent-facing label; the materialization port maps it to the publishing
// platform enum (wechatVideo).
const DEFAULT_PLATFORMS = ["douyin", "bilibili", "xiaohongshu", "wechat"];

const PLATFORM_LABEL: Record<string, string> = {
  douyin: "抖音（竖屏短视频，强钩子、快节奏、口语化）",
  bilibili: "B站（横屏中视频，信息密度高、可展开、标题党适度）",
  xiaohongshu: "小红书（图文/笔记体，emoji、分点、种草感、话题标签）",
  wechat: "公众号（长文，结构完整、有标题有小标题、可深读）",
};

// 把 CreativeContext + 脚本 + 目标平台映射成 platform.adapt 模板的 facets(占位化原 buildAdaptPrompt
// 的上下文块）。targets(目标平台清单)是必需 facet,调用方按 platforms 计算。
function adaptFacets(
  context: CreativeContext,
  scriptText: string,
  platforms: string[],
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑适配）",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
    script: scriptText ? `\n【原始脚本/内容】\n${scriptText}` : "",
    targets: platforms
      .map((p) => `· ${p}：${PLATFORM_LABEL[p] ?? p}`)
      .join("\n"),
  };
}

// Normalize the schema-validated drafts array into per-platform drafts (T-025:结构化后拿的是
// 已解析对象,归一逻辑原样保留 —— trim、滤掉缺 platform/title 的项、清空标签)。
// L6:透传 auditFlags(发布审核 SOP 结论)——同 tags 的清洗(trim + 滤空),只加不改既有字段。
function normalizePlatformDrafts(
  drafts: PlatformAdaptOutput["drafts"],
): PlatformDraft[] {
  return (drafts ?? [])
    .map((o): PlatformDraft | null => {
      const platform = (o.platform ?? "").trim();
      const title = (o.title ?? "").trim();
      if (!platform || !title) return null;
      // 发布平台简介用于直接复制粘贴；模型常按段落输出空行，这里只折叠空白，
      // 不改写任何文字、标点或创作取舍。
      const body = (o.body ?? "").replace(/\s+/gu, " ").trim();
      if (!body) {
        throw new Error(
          `发布物料缺少简介(body)：${platform || "未知平台"}`,
        );
      }
      const tags = (o.tags ?? [])
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t): t is string => t.length > 0);
      const auditFlags = (o.auditFlags ?? [])
        .map((f) => (typeof f === "string" ? f.trim() : ""))
        .filter((f): f is string => f.length > 0);
      return {
        platform,
        title,
        body,
        tags,
        coverIdea: o.coverIdea ?? "",
        auditFlags,
      };
    })
    .filter((d): d is PlatformDraft => d !== null);
}

export async function preparePlatformAdaptContext(ctx:RequestContext,task:{projectId:string|null;inputData:Record<string,unknown>},deps:ContextDeps){
  requireOutputId(task.inputData);
  const topic=typeof task.inputData.topic === "string" ? task.inputData.topic : "";
  const scriptText=typeof task.inputData.scriptText === "string" ? task.inputData.scriptText : "";
  const platforms=Array.isArray(task.inputData.platforms) && task.inputData.platforms.length>0 ? task.inputData.platforms.filter((p):p is string=>typeof p === "string") : DEFAULT_PLATFORMS;
  const context=await assembleCreativeContext(ctx,{projectId:task.projectId,topic},deps);
  return adaptFacets(context,scriptText,platforms);
}
function requireOutputId(inputData:Record<string,unknown>):string{
  const outputId=typeof inputData.outputId === "string" ? inputData.outputId : "";
  if(!outputId)throw new Error("platform-adapt-runner: inputData.outputId is required");
  return outputId;
}
/** 只整理通过结构化节点的候选；输出实体由原始业务任务决定。 */
export function projectPlatformAdaptCandidate(inputData:Record<string,unknown>,object:PlatformAdaptOutput):RecordCandidateInput{
  const outputId=requireOutputId(inputData);
  const drafts=normalizePlatformDrafts(object.drafts);
  if(drafts.length===0)throw new Error("platform-adapt-runner: agent returned no parseable drafts");
  return {resultType:"publication_drafts",resultData:{drafts,outputId}};
}
