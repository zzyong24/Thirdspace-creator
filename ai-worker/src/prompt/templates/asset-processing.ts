import { z } from 'zod';
import type { PromptTemplate } from '../template';
export const CLASSIFY_PROMPT = [
    "你是短视频创作者的素材管理员。看这张图,输出 JSON:",
    '{"tags":["用途标签"],"description":"一句话描述(≤40字,说清画面内容与可用场景)"}',
    "tags 从这个词表里选(可多选,不臆造新词):封面、截图、录屏、实拍、B-roll、图表、人物、产品。",
    "只输出 JSON,不要多余文字。",
].join("\n");
export function parseClassification(raw: string): {
    tags: string[];
    description: string;
} | null {
    const text = raw.replace(/```(?:json)?/g, "").trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m)
        return null;
    try {
        const o = JSON.parse(m[0]) as {
            tags?: unknown;
            description?: unknown;
        };
        const tags = Array.isArray(o.tags)
            ? o.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).slice(0, 5)
            : [];
        const description = typeof o.description === "string" ? o.description.trim().slice(0, 80) : "";
        if (tags.length === 0 && !description)
            return null;
        return { tags, description };
    }
    catch {
        return null;
    }
}
export const MATERIAL_SUMMARY_TEMPLATE = {
    id: "material.extract",
    version: "v1",
    system: [
        "你是短视频创作者的资料分析员。把创作者上传的第一手资料浓缩成结构化「资料要点卡」,供后续写文案紧扣。",
        "",
        "铁律(违反即失职):",
        "1. 只提炼原文**已明确写出**的事实、数据、卖点 —— 逐字有据。原文没写的,一个字都不许补。",
        "2. keyPoints:资料的核心论点/信息(≤6 条,每条一句)。",
        "3. facts:可核验的具体事实与数据(数字、规格、时间、价格等),照抄原文口径,不改写不四舍五入。",
        "4. sellingPoints(卖点):**只允许摘录原文已声明的卖点**,AI 绝不创造新卖点。",
        "   ✅ 原文写「续航 20 小时」→ sellingPoints 可含「长续航(20 小时)」。",
        "   ❌ 原文没提防水 → 绝不得写「防水」;拿不准是不是卖点 → 不放进 sellingPoints。",
        "5. 拿不准、原文没有的字段 → 留空数组。宁缺毋滥,绝不编造。",
        "只输出 JSON,不要多余文字。",
    ].join("\n"),
    template: "以下为创作者上传的资料全文(可能已截断):\n\n{{fullText}}",
    requiredFacets: ["fullText"] as const,
} as const;
export const materialSummarySchema = z.object({ keyPoints: z.array(z.string()), facts: z.array(z.string()), sellingPoints: z.array(z.string()).optional() });
export const classificationSchema = z.object({ tags: z.array(z.string()), description: z.string() }).refine(v => v.tags.length > 0 || Boolean(v.description));
export const MATERIAL_EXTRACT_TEMPLATE: PromptTemplate = { ...MATERIAL_SUMMARY_TEMPLATE, requiredFacets: ['fullText'], outputSchema: materialSummarySchema };
export const ASSET_CLASSIFY_TEMPLATE: PromptTemplate = { id: 'asset.classify', version: 'v1', system: CLASSIFY_PROMPT, template: '{{image}}', requiredFacets: ['image'], outputSchema: classificationSchema };
