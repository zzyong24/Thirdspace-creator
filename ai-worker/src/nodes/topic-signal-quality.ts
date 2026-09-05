// 共享原选题质量画像渲染；只迁移既有规则，不新增语义判断。
export interface SignalQualityProfile {
  comments: {
    /** 信号总条数(评论/私信/咨询/复盘)。 */
    count: number;
    /** 评论覆盖了几个作品(distinct publicationId;存量无锚 → 计不进,诚实偏低)。 */
    coveredWorks: number;
    /** 强信号占比(含问题/诉求启发式,0~1;count=0 → 0)。 */
    strongSignalRatio: number;
    /** 噪声占比(666/纯 emoji/夸赞类,0~1;count=0 → 0)。 */
    noiseRatio: number;
  };
  positioning: {
    /** 9 个定位 facet(人设/领域/人群/差异化/内容范围/不做什么/核心痛点/核心价值/表达风格)填了几个。 */
    filledFacets: number;
    /** facet 总数(恒 9,渲染「x/9」用)。 */
    totalFacets: number;
    /** 5 条下游规则(选题/写稿/项目/禁止/表达)填了几条。 */
    rulesFilled: number;
    /** 完整度 = filledFacets / totalFacets(0~1)。 */
    completeness: number;
  };
  knowledge: {
    /** 知识条目数(读侧上限内的实际条数)。 */
    count: number;
    /** 近 30 天条目占比(0~1);读源不带 createdAt → null(诚实「新鲜度未知」,不编)。 */
    recentRatio: number | null;
  };
  trend: {
    /** 拉到信号的信源路数(distinct 已登记信源名 + web 搜索算一路)。 */
    sourceCount: number;
    /** 信号总条数(已登记信源信号 + web 搜索命中)。 */
    signalCount: number;
  };
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * [T-238] 把画像渲成「依据质量画像」段(事实 + 确定性阈值派生的定权建议;最终权重仍由 AI 结合
 * 画像判断 —— 非硬性打分表)。恒非空(四源哪怕全空也如实说「无」,让模型知道依据有多薄)。
 */
export function renderSignalQualityBrief(
  profile: SignalQualityProfile,
): string {
  const lines: string[] = ["【依据质量画像 —— 按此动态定权,各依据不平权】"];

  // 评论。
  const c = profile.comments;
  if (c.count === 0) {
    lines.push("· 评论信号:无 —— 本次不要声称「受众在问/受众需求」。");
  } else {
    const facts = [
      `共 ${c.count} 条`,
      c.coveredWorks > 0 ? `覆盖 ${c.coveredWorks} 个作品` : "覆盖作品数未知",
      `强信号占比 ${pct(c.strongSignalRatio)}`,
      `噪声占比 ${pct(c.noiseRatio)}`,
    ].join(",");
    const hints: string[] = [];
    if (c.count < 10) hints.push("样本少");
    if (c.noiseRatio >= 0.4) hints.push("噪声高");
    if (c.coveredWorks <= 1) hints.push("覆盖窄(幸存者偏差风险)");
    lines.push(
      `· 评论信号:${facts}${
        hints.length > 0
          ? ` —— ${hints.join("、")}:降低评论权重,只取 ★强信号 条目,不要把孤例放大成普遍需求`
          : " —— 样本可用:可作主要依据之一"
      }。`,
    );
  }

  // 定位。
  const po = profile.positioning;
  if (po.filledFacets === 0) {
    lines.push("· 定位:未设置 —— 无骨架可依,按通用爆款逻辑出题并如实说明。");
  } else {
    lines.push(
      `· 定位:完整度 ${po.filledFacets}/${po.totalFacets}(下游规则 ${po.rulesFilled}/5 条)${
        po.completeness >= 0.7
          ? " —— 完整度高:当出题骨架,升权"
          : " —— 完整度一般:作方向参考,别过度外推"
      }。`,
    );
  }

  // 知识库。
  const k = profile.knowledge;
  if (k.count === 0) {
    lines.push("· 知识库:空 —— 不要声称「有现成素材可依托」。");
  } else {
    lines.push(
      `· 知识库:${k.count} 条${
        k.recentRatio == null
          ? "(新鲜度未知)"
          : `,近 30 天占比 ${pct(k.recentRatio)}`
      }。`,
    );
  }

  // 热点。
  const t = profile.trend;
  if (t.signalCount === 0) {
    lines.push("· 热点信号:本次未拉到实时信号 —— 不要声称候选基于实时热榜。");
  } else {
    lines.push(
      `· 热点信号:${t.signalCount} 条(来自 ${t.sourceCount} 路信源)${
        t.sourceCount >= 2
          ? " —— 多源佐证,证据密度可"
          : " —— 单源,交叉验证弱,降权引用"
      }。`,
    );
  }

  return lines.join("\n");
}
