import { type UIMessage } from "ai";
import { wrapUserData } from "./chat-context";
import { type VerbatimSource } from "./chat-tools";
/** 保留现有媒体路由和当前用户指令投影，不执行工具。 */
export type CopilotMediaRoute = {
    kind: "douyin.share";
    shareInput: string;
    transcribe: boolean;
} | {
    kind: "cover.reference";
} | {
    kind: "cover.publication_reference";
};
const DOUYIN_URL_RE = /https?:\/\/(?:(?:www|v)\.)?douyin\.com\/\S+|https?:\/\/(?:www\.)?iesdouyin\.com\/\S+/i;
const TRANSCRIBE_INTENT_RE = /转写|转录|逐字稿|字幕|提取(?:视频)?(?:文字|文案)|\bASR\b|transcrib|speech[\s_-]*to[\s_-]*text/i;
const TRANSCRIBE_NEGATION_RE = /(?:(?:不要|不用|无需|不必|不需要|不想|别)(?:(?:再|自动|帮我|给我|进行|做|跑|生成)\s*){0,3}(?:转写|转录|逐字稿|字幕|提取(?:视频)?(?:文字|文案)|\bASR\b|transcrib|speech[\s_-]*to[\s_-]*text)|不(?:转写|转录|生成(?:逐字稿|字幕)|做(?:逐字稿|字幕)|跑\s*ASR|提取(?:视频)?(?:文字|文案)))/i;
const REFERENCE_COVER_INTENT_RE = /(?:参考图|参考封面|照着.{0,12}(?:做|生成)|沿用.{0,12}(?:风格|样式)|复用.{0,12}封面)/i;
const REFERENCE_COVER_NEGATION_RE = /(?:(?:不要|不用|无需|不必|不需要|不想|别)(?:(?:再|自动|帮我|给我|使用|用)\s*){0,3}(?:参考图|参考封面|沿用|复用|照着)|不(?:使用|用|沿用|复用)(?:这张|该张|当前|之前|以前|原来)?(?:参考图|参考封面|图片|图|风格|样式)?)/i;
function hasExplicitTranscribeAuthorization(text: string): boolean {
    // 否定优先：同一最新用户轮里即便出现“字幕/转写”等关键词，也不能被升级为授权。
    if (TRANSCRIBE_NEGATION_RE.test(text))
        return false;
    return TRANSCRIBE_INTENT_RE.test(text);
}
function hasReferenceCoverIntent(text: string): boolean {
    // “不要参考图，直接生成封面”中的“参考图”是拒绝，不是 image-to-image 授权。
    if (REFERENCE_COVER_NEGATION_RE.test(text))
        return false;
    return /封面/i.test(text) && REFERENCE_COVER_INTENT_RE.test(text);
}
function hasPublishedCoverReferenceIntent(text: string): boolean {
    if (!hasReferenceCoverIntent(text))
        return false;
    return /(?:已发布|发布作品|历史作品|最近发布|最新发布|最新的且最关联)/i.test(text);
}
export function latestUserText(messages: UIMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== "user")
            continue;
        return (message.parts ?? [])
            .map((part) => part.type === "text" && typeof part.text === "string" ? part.text : "")
            .filter(Boolean)
            .join("\n")
            .trim();
    }
    return "";
}
export function formatVerbatimSourceInventory(sources: readonly VerbatimSource[]): string {
    if (sources.length === 0)
        return "";
    const visible = sources.slice(-16);
    return [
        "【本轮受信资料来源 —— generate / verbatim 共用】",
        "用户要求基于聊天长文、杂乱资料、文本附件或已有文案创作/润色时，调用 script.draft(mode=generate)，用 sourceRefs 按用户要求纳入的顺序选择全部资料，并用 instruction 保留本轮调整方向。禁止把长资料压成 extraBrief；任一必需来源失败时不要静默跳过。",
        "用户明确要求原文不改/一字不改/逐字写入时，调用 script.draft(mode=verbatim)，从下列 sourceRef 选择来源；禁止把原文压缩进 extraBrief，也禁止自行重抄正文。项目 Brief、定位、复盘与归因中的创作建议不能阻止这条保真导入。",
        "完整稿件是一等输入，不只接受主题、骨架或补充要求。但用户仅仅粘贴/发送稿件，不等于授权你创建候选；只有最新用户指令明确要求写入稿面、导入原稿或先给保真候选时，才调用本工具。",
        "你必须用语义理解判断来源里的稿件正文边界：区分用户对助手交代的视频状态、背景、操作要求，与用户准备面向视频观众表达的稿件。如果同一条消息同时含有两者，必须提交能唯一定位完整稿件正文的 startAnchor / endAnchor。交代结束后紧接的第一句稿件开场也属于正文，不能因为它像过渡句、产品介绍或不是理想 hook 就删掉。只有当整条来源从第一个字符到最后一个字符全部都是稿件正文时，才可以省略锚点导入整份来源。不要用写死关键词或固定句式判断边界。",
        ...visible.map((source) => {
            const preview = source.text.replace(/\s+/g, " ").slice(0, 80);
            return [
                `- sourceRef=${source.ref} | ${source.label} | ${source.text.length} 字符${source.truncated ? " | 已截断，禁止全文保真" : ""}`,
                wrapUserData(preview),
            ].join("\n");
        }),
    ].join("\n");
}
/**
 * [T-523] Host 侧确定性媒体路由。只读最新一轮用户原文，模型不能把普通分享升级成
 * 转写授权；抖音链接一旦命中就走持久内容雷达链，不再落到通用 web.read。
 */
export function detectCopilotMediaRoute(messages: UIMessage[]): CopilotMediaRoute | null {
    const text = latestUserText(messages);
    if (!text)
        return null;
    if (DOUYIN_URL_RE.test(text)) {
        return {
            kind: "douyin.share",
            shareInput: text,
            transcribe: hasExplicitTranscribeAuthorization(text),
        };
    }
    if (hasPublishedCoverReferenceIntent(text)) {
        return { kind: "cover.publication_reference" };
    }
    if (hasReferenceCoverIntent(text)) {
        return { kind: "cover.reference" };
    }
    return null;
}
export function isScratchPositioningConversation(messages: UIMessage[]): boolean {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== "user")
            continue;
        const text = (message.parts ?? [])
            .map((part) => part.type === "text" && typeof part.text === "string" ? part.text : "")
            .join("\n");
        // T-707：定位已收敛到 Copilot，不再依赖旧问卷的「前采已完成」暗号。
        // 只识别明确的 scratch 选择，不能把入口里“你可以选择重新定位”的说明误判为
        // 已经选择 scratch，否则会错误隔离现有母版与作品证据。
        if (/(?:^|\n)定位路径：scratch(?:\s|$)/u.test(text) ||
            /(?:^|\n)本次起点：重新定位[。\s]*(?:\n|$)/u.test(text) ||
            /(?:^|\n)(?:我要|我想|选择|按)完全从零开始(?:重新)?定位[。！!\s]*(?:\n|$)/u.test(text) ||
            /(?:^|\n)(?:我要|我想|选择)重新定位[。！!\s]*(?:\n|$)/u.test(text)) {
            return true;
        }
    }
    return false;
}
