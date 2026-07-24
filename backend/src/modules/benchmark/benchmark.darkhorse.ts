// [T-235b] 低粉黑马判定纯函数(用户实战方法论,移植 xianwa-feishu/yuyu/darkhorse.py:60-105,
//   SPEC 2026-07-11 daily-topic-autopilot §2.2)。
//
// 原理:低粉 + 新发(≤48h)+ 高赞 = 算法在推**内容本身**而非账号权重 → 选题/形式已被验证且
//   **跟拍窗口未关**。核心信号 = **赞粉比**(digg/fans)。
//
// 三档判据(任一命中即黑马;阈值全配置化,默认即 darkhorse.py 的实战值):
//   strong:digg ≥ 1000 且(fans ≤ 10w 或 赞粉比 ≥ 1)—— 强信号(点赞 > 粉丝 = 算法纯推内容)。
//   niche :digg ≥ 200 且 赞粉比 ≥ 0.5 —— 垂类信号(小词的小号起爆)。
//   mid   :digg ≥ 500 且 fans ≤ 3w —— 中等信号。
// 时间窗:发布距 now ≤ windowHours(默认 48h)才算(跟拍时效的硬边界);createTime 缺失(0/负)
//   → 视为窗口外(诚实:不知道多新就不当黑马,不编)。
// 排序:档位 strong→niche→mid、非空赞粉比降序、点赞降序、发布时间降序、item id
//   升序;取 top perKeywordLimit(默认 5)。
//
// 纯函数、无 IO、无 Date(now 由调用方传入)—— 与 detectViral 同款铁律:黑马判定是确定性
//   统计,绝不调 LLM。fans=null 是未知并排除；fans=0 是已知零粉，赞粉比为 null，只能走
//   strong/mid 的绝对点赞+粉丝上限分支，不能制造无穷赞粉比。

export interface DarkhorseInputVideo {
  awemeId: string;
  diggCount: number;
  /** 作者粉丝数(赞粉比分母);null = 未知，0 = 平台明确返回零粉。 */
  authorFollowerCount: number | null;
  /** 作品发布时间(unix 秒,抖音原值)。null/0/负 = 未知 → 视为窗口外。 */
  createTime: number | null;
}

/** 命中档位:strong 强信号 / niche 垂类 / mid 中等(darkhorse.py 三档)。 */
export type DarkhorseTier = "strong" | "niche" | "mid";

export interface DarkhorseVerdict {
  awemeId: string;
  tier: DarkhorseTier;
  /** 赞粉比；粉丝数为 0 时为 null，绝不伪造无限或以 1 为分母。 */
  likeFollowerRatio: number | null;
  /** 发布距 now 的小时数(诊断/展示「N 小时前发」)。 */
  ageHours: number;
}

export interface DetectDarkhorseOptions {
  /** strong 档最低点赞(默认 1000)。 */
  strongMinDigg?: number;
  /** strong 档粉丝上限(默认 100000 = 10w)。 */
  strongMaxFans?: number;
  /** niche 档最低点赞(默认 200)。 */
  nicheMinDigg?: number;
  /** niche 档最低赞粉比(默认 0.5)。 */
  nicheMinRatio?: number;
  /** mid 档最低点赞(默认 500)。 */
  midMinDigg?: number;
  /** mid 档粉丝上限(默认 30000 = 3w)。 */
  midMaxFans?: number;
  /** 时间窗(小时,默认 48 —— 跟拍窗口)。 */
  windowHours?: number;
  /** 每关键词最多取几条(默认 5;赞粉比降序后截断)。 */
  perKeywordLimit?: number;
}

export const DEFAULT_DARKHORSE_OPTIONS: Required<DetectDarkhorseOptions> = {
  strongMinDigg: 1000,
  strongMaxFans: 100_000,
  nicheMinDigg: 200,
  nicheMinRatio: 0.5,
  midMinDigg: 500,
  midMaxFans: 30_000,
  windowHours: 48,
  perKeywordLimit: 5,
};

/**
 * 判定一批搜索结果里的黑马:窗口过滤 → 三档判据 → 赞粉比降序(同比按赞降序)→ 取 top N。
 * nowSec = 当前 unix 秒(调用方传入,保纯函数确定性)。空输入 → []。
 */
export function detectDarkhorse(
  videos: DarkhorseInputVideo[],
  nowSec: number,
  opts: DetectDarkhorseOptions = {},
): DarkhorseVerdict[] {
  const o = { ...DEFAULT_DARKHORSE_OPTIONS, ...opts };
  const out: DarkhorseVerdict[] = [];
  for (const v of videos) {
    // 时间窗:createTime 缺失(≤0)→ 不知道多新 → 诚实排除(黑马的价值就在「新」)。
    if (v.createTime === null || v.createTime <= 0) continue;
    if (v.authorFollowerCount === null) continue;
    const ageHours = (nowSec - v.createTime) / 3600;
    if (ageHours < 0 || ageHours > o.windowHours) continue;

    const digg = v.diggCount;
    const fans = v.authorFollowerCount;
    const ratio = fans > 0 ? digg / fans : null;

    // 三档判据(strong 优先归档 —— 命中多档取信号最强的档)。
    let tier: DarkhorseTier | null = null;
    if (
      digg >= o.strongMinDigg &&
      (fans <= o.strongMaxFans || (ratio !== null && ratio >= 1))
    ) {
      tier = "strong";
    } else if (
      digg >= o.nicheMinDigg &&
      ratio !== null &&
      ratio >= o.nicheMinRatio
    ) {
      tier = "niche";
    } else if (digg >= o.midMinDigg && fans <= o.midMaxFans) {
      tier = "mid";
    }
    if (!tier) continue;

    out.push({
      awemeId: v.awemeId,
      tier,
      likeFollowerRatio:
        ratio === null ? null : Math.round(ratio * 10) / 10,
      ageHours: Math.round(ageHours * 10) / 10,
    });
  }
  const byId = new Map(videos.map((video) => [video.awemeId, video]));
  const tierRank: Record<DarkhorseTier, number> = {
    strong: 0,
    niche: 1,
    mid: 2,
  };
  out.sort(
    (a, b) => {
      const aVideo = byId.get(a.awemeId);
      const bVideo = byId.get(b.awemeId);
      return (
        tierRank[a.tier] - tierRank[b.tier] ||
        (b.likeFollowerRatio ?? Number.NEGATIVE_INFINITY) -
          (a.likeFollowerRatio ?? Number.NEGATIVE_INFINITY) ||
        (bVideo?.diggCount ?? 0) - (aVideo?.diggCount ?? 0) ||
        (bVideo?.createTime ?? 0) - (aVideo?.createTime ?? 0) ||
        a.awemeId.localeCompare(b.awemeId)
      );
    },
  );
  return out.slice(0, o.perKeywordLimit);
}
