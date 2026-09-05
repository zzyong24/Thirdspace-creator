// [T-256c] 素材整理领域工具适配器(SPEC §3:素材抓取/整理 = 决策层给引擎,落地给端口)。
// 工具 = 素材搜索(纯读)+ 素材归类整理(writeback,打标签/归组)。**agent 决策·端口执行**:
// 引擎决定「哪些素材归哪类/打什么标签」,真正的写走端口(铁律②:整理动作可逆 / pending 在端口)。
//
// 复用锚:material.search 端口 = 现有 context.materials 只读端口(assets 搜索,chat-tools ChatToolDeps
// searchMaterials 同口径);organize 端口 = assets 打标/归类的既有写路径。本适配器只包成引擎工具
// (白名单 agentic.material),不重造素材库逻辑。
import { z } from "zod";
import type { AgenticTool } from "../engine";

/** 素材整理端口(ctx-free 窄接口;persistence-client 绑真素材库端口,测试注 fake)。 */
export interface MaterialPorts {
  /** 按 query 搜素材库(纯读)。 */
  searchMaterials(
    input: { query: string;limit?:number;cursor?:string|null },
    signal: AbortSignal,
  ): Promise<{
    items: Array<{ id: string; title: string; kind: string }>;
    nextCursor?:string|null;
  }>;
  /**
   * 归类整理:给一批素材打标签/归组(端口内保证可逆 / 落 pending;铁律②)。返回受影响条数。
   */
  organizeMaterials(
    input: { assetIds: string[]; tag: string },
    signal: AbortSignal,
  ): Promise<{ affected: number }>;
}

const searchParams = z.object({ query: z.string().min(1),limit:z.number().int().min(1).max(100).default(20),cursor:z.string().nullable().optional() });
const organizeParams = z.object({
  assetIds: z.array(z.string().min(1)).min(1),
  tag: z.string().min(1),
});

/** 把素材整理端口包成两个引擎工具(agentic.material 白名单)。 */
export function createMaterialTools(ports: MaterialPorts): AgenticTool[] {
  return [
    {
      name: "material.search",
      label: "搜素材库",
      description: "按字面名称搜索素材库，返回id/标题/类型和nextCursor；存在nextCursor时保持query并带cursor继续读取。纯读。",
      effect: "none",
      parameters: searchParams,
      planInput: (goal) => ({ query: goal }),
      async execute(input, { signal }) {
        signal.throwIfAborted();
        const params = searchParams.parse(input);
        const res = await ports.searchMaterials(params, signal);
        signal.throwIfAborted();
        return {
          hasEvidence: res.items.some(item => Boolean(item.id.trim())),
          summary: `搜到 ${res.items.length} 个素材`,
          data: { items: res.items,nextCursor:res.nextCursor ?? null },
        };
      },
    },
    {
      name: "material.organize",
      label: "归类素材",
      description:
        "给一批素材打标签/归组(可逆整理动作)。用于把搜到的素材按主题聚合。",
      effect: "writeback",
      parameters: organizeParams,
      // 确定性引擎:把上一步搜到的素材全部打上「目标」标签,串起 搜→整理。
      planInput: (goal, outputs) => {
        const search = outputs["material.search"] as
          | { items?: Array<{ id: string }> }
          | undefined;
        const assetIds = (search?.items ?? []).map((i) => i.id);
        return { assetIds, tag: goal.slice(0, 24) };
      },
      async execute(input, { signal, dryRun }) {
        const parsed = organizeParams.safeParse(input);
        if (!parsed.success) return { summary: "无素材可整理(上一步搜索为空)" };
        const { assetIds, tag } = parsed.data;
        if (dryRun) {
          return {
            summary: `[计划] 拟给 ${assetIds.length} 个素材打标签「${tag}」`,
            plan: `将给素材 ${assetIds.join(", ")} 打标签「${tag}」`,
          };
        }
        const { affected } = await ports.organizeMaterials(
          { assetIds, tag },
          signal,
        );
        return {
          hasEvidence: true,
          summary: `已给 ${affected} 个素材打标签「${tag}」`,
          data: { affected, tag },
        };
      },
    },
  ];
}
