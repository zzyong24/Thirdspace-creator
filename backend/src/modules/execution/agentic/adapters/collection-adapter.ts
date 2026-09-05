// [T-256c] 抓取决策领域工具适配器(SPEC §3:数据抓取 = 引擎决策「刷哪些/何时停/错误重试」,
// 真正抓取走 ingestion 确定性端口)。**核心受控点(SPEC §3 不能松的螺丝)**:引擎的自由限在
// 「决策」(该抓哪个作品、够了没),**不在 raw 执行** —— 限流/防封/登录态/幂等全烤在采集端口里,
// agent 拿的是「刷这批作品指标」这样的领域工具,不是 raw 浏览器,无法绕过端口的速率限制。
//
// 复用锚:collect.run 端口 = 现有 ingestion 确定性采集端口(runScheduledCollection 的 collector 语义,
// 封号纪律在端口,T-007 D3);本适配器只把它包成引擎工具(白名单 agentic.collect),不重造采集逻辑。
import { z } from "zod";
import type { AgenticTool } from "../engine";

/** 抓取决策端口(ctx-free 窄接口;persistence-client 绑真 ingestion 采集端口,测试注 fake)。 */
export interface CollectionPorts {
  /** 列可采集目标(供引擎决策刷哪些)。纯读,不抓。 */
  listTargets(
    input: { query?: string },
    signal: AbortSignal,
  ): Promise<{
    targets: Array<{ id: string; label: string; lastCollectedAt: string | null }>;
  }>;
  /**
   * 对一个目标跑一次确定性采集(**限流/防封/登录态在端口内**;agent 只给 targetId,绕不过速率限制)。
   * 未登录 → needsLogin(引导重连,非普通失败)。返回新鲜度统计。
   */
  runCollection(
    input: { targetId: string },
    signal: AbortSignal,
  ): Promise<
    | { ok: true; itemsNew: number; itemsUpdated: number }
    | { ok: false; needsLogin: true }
  >;
}

const listTargetsParams = z.object({ query: z.string().optional() });
const runCollectionParams = z.object({ targetId: z.string().min(1) });

/** 把抓取决策端口包成两个引擎工具(agentic.collect 白名单)。 */
export function createCollectionTools(ports: CollectionPorts): AgenticTool[] {
  return [
    {
      name: "collect.plan",
      label: "列采集目标",
      description:
        "列出可采集的目标(作品/账号/收藏夹)及上次采集时间,供决策刷哪些、跳过哪些。纯读不抓。",
      effect: "none",
      parameters: listTargetsParams,
      planInput: () => ({}),
      async execute(input, { signal }) {
        const { query } = listTargetsParams.parse(input);
        const res = await ports.listTargets({ query }, signal);
        return {
          hasEvidence: res.targets.some(target => Boolean(target.id.trim())),
          summary: `发现 ${res.targets.length} 个可采集目标`,
          data: { targets: res.targets },
        };
      },
    },
    {
      name: "collect.run",
      label: "采集一个目标",
      description:
        "对一个目标跑一次采集(速率限制/防封/登录态由端口保证,不可绕过)。抓真数据落库,返回新鲜度统计。",
      // 采集=数据摄取(确定性重放,非对外发布)—— writeback;限流/防封在端口。
      effect: "writeback",
      parameters: runCollectionParams,
      // 确定性引擎:采上一步 plan 里最久未采(lastCollectedAt 最早/为空)的目标,串起 决策→执行。
      planInput: (_goal, outputs) => {
        const plan = outputs["collect.plan"] as
          | { targets?: Array<{ id: string; lastCollectedAt: string | null }> }
          | undefined;
        const targets = plan?.targets ?? [];
        if (targets.length === 0) return { targetId: "" };
        const pick = [...targets].sort((a, b) => {
          const ta = a.lastCollectedAt ? Date.parse(a.lastCollectedAt) : 0;
          const tb = b.lastCollectedAt ? Date.parse(b.lastCollectedAt) : 0;
          return ta - tb;
        })[0]!;
        return { targetId: pick.id };
      },
      async execute(input, { signal, dryRun }) {
        const { targetId } = runCollectionParams.parse(input);
        if (!targetId) return { summary: "无可采目标(上一步 plan 为空)" };
        if (dryRun) {
          return {
            summary: `[计划] 拟采集目标 ${targetId}`,
            plan: `将对目标 ${targetId} 跑一次限流采集(端口内防封)`,
          };
        }
        const res = await ports.runCollection({ targetId }, signal);
        if (!res.ok) {
          return {
            summary: `目标 ${targetId} 需重新登录,已跳过(端口报 needs_reconnect)`,
            data: { targetId, needsLogin: true },
          };
        }
        return {
          hasEvidence: true,
          summary: `采集 ${targetId}:新增 ${res.itemsNew}、更新 ${res.itemsUpdated}`,
          data: {
            targetId,
            itemsNew: res.itemsNew,
            itemsUpdated: res.itemsUpdated,
          },
        };
      },
    },
  ];
}
