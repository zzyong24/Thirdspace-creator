import type { ReviewRuleRow } from "./review-gate.repository";

// 审核规则种子(T-086a,SPEC §1)—— 从用户知识库移植:
//   主源:/Users/zyongzhu/ThirdSpace/00-系统/Skills/creative-video-workflow/references/v5/douyin-compliance.md
//        (Tier1 官方硬规则蒸馏自《社区自律公约》原文,标注小节号;Tier2 经验限流;doud+ 投放词 2026-07-02 实测)
//   辅源:/Users/zyongzhu/ThirdSpace/00-系统/审核/内容发布审核清单.md
//        (❌→✅ 替代词表,源自该账号 3-5 月 16 条自见 case;与主源冲突以主源为准)
// 移植原则(SPEC §1):
//   ① 词表类逐条成行(降权词/营销词/doud+ 两类词/谐音导流变体);
//   ② 替代词随行入 replacement;
//   ③ 辅源「第三方品牌词一律禁」已被主源更正为过严(AI 教学语境点名工具不违规)——
//      冲突条目按主源,存档一条 disabled 行留更正说明(表内无 active 的品牌词规则);
//   ④ 官方条文类语义规则(公约 34/33/35/25 全文)不进 lint 表 —— 归 L2 语义审 prompt(§2)。
// 幂等:id 确定性(rrule-seed-<slug>),仓储 seed 走 onConflictDoNothing。

interface SeedSpec {
  slug: string;
  tier: "official_hard" | "empirical" | "doudplus";
  category: string;
  matchType: "word" | "regex";
  pattern: string;
  replacement: string | null;
  note: string;
  status?: "active" | "disabled";
}

const SEED_RULES: SeedSpec[] = [
  // ── Tier 1 · official_hard:公约 34 导流条文的确定性投影(站外联络方式/谐音变体)──
  {
    slug: "daoliu-weixin-homophone",
    tier: "official_hard",
    category: "导流",
    matchType: "regex",
    pattern: "[VvＶｖ]\\s*信|薇\\s*信|威\\s*信",
    replacement: "站内互动(关注/评论/私信)",
    note: "公约34 恶意导流 —— 微信谐音变体(V信/薇信/威信)属站外联络方式,禁留",
  },
  {
    slug: "daoliu-jiawo",
    tier: "official_hard",
    category: "导流",
    matchType: "regex",
    pattern: "加\\s*我|\\+\\s*我",
    replacement: "欢迎评论区交流",
    note: "公约34 恶意导流 —— 「加我/+我」诱导站外联系",
  },
  {
    slug: "daoliu-zhuye",
    tier: "official_hard",
    category: "导流",
    matchType: "regex",
    pattern: "主页\\s*(有|看|置顶)",
    replacement: null,
    note: "公约34 恶意导流 —— 「主页有/主页看/主页置顶」导流暗语,视语境改写",
  },
  {
    slug: "daoliu-phone",
    tier: "official_hard",
    category: "隐私",
    matchType: "regex",
    pattern: "1[3-9]\\d{9}",
    replacement: null,
    note: "公约34 站外联络方式 + 隐私条款 —— 手机号(11 位)不得出现在物料",
  },
  {
    slug: "daoliu-qq",
    tier: "official_hard",
    category: "导流",
    matchType: "word",
    pattern: "QQ",
    replacement: "站内私信",
    note: "公约34 恶意导流 —— QQ 属站外联络方式",
  },
  {
    slug: "daoliu-qrcode",
    tier: "official_hard",
    category: "导流",
    matchType: "word",
    pattern: "二维码",
    replacement: "站内关注入口",
    note: "公约34 恶意导流 —— 二维码属「可识别导流标志」",
  },

  // ── Tier 2 · empirical:算法降权词(主源 Tier2「标题别用」)──
  {
    slug: "downweight-ganhuo",
    tier: "empirical",
    category: "降权词",
    matchType: "word",
    pattern: "干货",
    replacement: "实操方法",
    note: "主源 Tier2 算法降权词(标题别用;经验观察非官方明文)",
  },
  {
    slug: "downweight-yinghe",
    tier: "empirical",
    category: "降权词",
    matchType: "word",
    pattern: "硬核",
    replacement: "扎实",
    note: "主源 Tier2 算法降权词(标题别用)",
  },
  {
    slug: "downweight-quanwangzui",
    tier: "empirical",
    category: "降权词",
    matchType: "word",
    pattern: "全网最",
    replacement: "少见的",
    note: "主源 Tier2 算法降权词 + 绝对化倾向",
  },
  {
    slug: "downweight-baomuji",
    tier: "empirical",
    category: "降权词",
    matchType: "word",
    pattern: "保姆级",
    replacement: "分步演示",
    note: "主源 Tier2 算法降权词(标题别用)",
  },
  {
    slug: "downweight-chaoxiangxi",
    tier: "empirical",
    category: "降权词",
    matchType: "word",
    pattern: "超详细",
    replacement: "完整",
    note: "主源 Tier2 算法降权词(标题别用)",
  },
  {
    slug: "downweight-tuxue",
    tier: "empirical",
    category: "降权词",
    matchType: "word",
    pattern: "吐血整理",
    replacement: "系统整理",
    note: "主源 Tier2 算法降权词(标题别用)",
  },

  // ── Tier 2 · empirical:营销/变现敏感词(主源 Tier2 + 辅源 §2 ❌→✅ 替代表)──
  {
    slug: "marketing-bianxian",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "变现",
    replacement: "产生价值",
    note: "主源 Tier2 营销/变现敏感词(易判广告);辅源 §2:变现→实操/跑通/落地",
  },
  {
    slug: "marketing-gejiucai",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "割韭菜",
    replacement: "跑通",
    note: "主源 Tier2 营销/变现敏感词;辅源 §2 替代表",
  },
  {
    slug: "marketing-caifuziyou",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "财富自由",
    replacement: "落地",
    note: "主源 Tier2 营销/变现敏感词;辅源 §2 替代表",
  },
  {
    slug: "marketing-caokong",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "操控",
    replacement: "实操",
    note: "辅源 §2 营销敏感词替代表",
  },
  {
    slug: "marketing-baoli",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "暴利",
    replacement: "红利",
    note: "主源 Tier2 营销/变现敏感词;辅源 §2:暴利→红利",
  },
  {
    slug: "marketing-tangzhuan",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "躺赚",
    replacement: "增量",
    note: "主源 Tier2 营销/变现敏感词;辅源 §2:躺赚→增量",
  },
  {
    slug: "marketing-fengkou",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "风口",
    replacement: "趋势",
    note: "辅源 §2:风口→趋势",
  },
  {
    slug: "marketing-bikan",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "必看",
    replacement: "建议",
    note: "主源 Tier2 营销词;辅源 §2:必看→建议",
  },
  {
    slug: "marketing-cuoguohouhui",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "错过后悔",
    replacement: "值得关注",
    note: "辅源 §2:错过后悔→关注",
  },
  {
    slug: "marketing-buzhuan",
    tier: "empirical",
    category: "营销词",
    matchType: "word",
    pattern: "不转不是中国人",
    replacement: "欢迎分享",
    note: "辅源 §2 诱导转发极端句式",
  },
  {
    slug: "marketing-nianru",
    tier: "empirical",
    category: "营销词",
    matchType: "regex",
    pattern: "年入\\s*[0-9一二三四五六七八九十百千]+\\s*[wW万]",
    replacement: "真实数据",
    note: "主源 Tier2「年入 X 万」收益承诺 + 辅源 §2 数值夸大 → 换真实数据",
  },

  // ── Tier 2 · empirical:绝对化用语(主源 ⚠️ 注:广告法红线,纯分享也建议避,归 Tier2)──
  {
    slug: "absolute-quanwangdiyi",
    tier: "empirical",
    category: "绝对化",
    matchType: "word",
    pattern: "全网第一",
    replacement: "我用过里最好",
    note: "广告法绝对化用语(主源 Tier1 注⚠️归 Tier2 经验项);带货必避,纯分享建议避",
  },
  {
    slug: "absolute-shishangzuiqiang",
    tier: "empirical",
    category: "绝对化",
    matchType: "word",
    pattern: "史上最强",
    replacement: "目前很强",
    note: "广告法绝对化用语;同上",
  },
  {
    slug: "absolute-100pct",
    tier: "empirical",
    category: "绝对化",
    matchType: "regex",
    pattern: "100\\s*%|百分之百",
    replacement: "绝大多数情况",
    note: "广告法绝对化用语(100%/百分之百的断言保证);公约33「无合理依据的断言」同源",
  },

  // ── Tier 2 · empirical:情绪/悼念类(辅源 §3:审核收紧且完播差)──
  {
    slug: "emotion-daonian",
    tier: "empirical",
    category: "情绪类",
    matchType: "word",
    pattern: "悼念",
    replacement: null,
    note: "辅源 §3 情绪悼念类 → 转私域(朋友圈/微信群),平台审核收紧且完播差",
  },
  {
    slug: "emotion-zisha",
    tier: "empirical",
    category: "情绪类",
    matchType: "word",
    pattern: "自杀",
    replacement: null,
    note: "辅源 §3 + 公约违禁条(自杀自残含诱导教唆一票否决)→ 转专业心理渠道",
  },
  {
    slug: "emotion-yigu",
    tier: "empirical",
    category: "情绪类",
    matchType: "word",
    pattern: "已故",
    replacement: null,
    note: "辅源 §3 悼念类 → 转私域",
  },

  // ── Tier 2 · empirical:本地模型/版权合规(辅源 §4)──
  {
    slug: "compliance-pojie",
    tier: "empirical",
    category: "其他",
    matchType: "word",
    pattern: "破解",
    replacement: "官方推荐",
    note: "辅源 §4 本地模型/版权合规 → 破解/离线激活换官方推荐",
  },
  {
    slug: "compliance-daoban",
    tier: "empirical",
    category: "其他",
    matchType: "word",
    pattern: "盗版",
    replacement: "正版/官方渠道",
    note: "辅源 §4 版权合规",
  },
  {
    slug: "compliance-fanqiang",
    tier: "empirical",
    category: "其他",
    matchType: "word",
    pattern: "翻墙",
    replacement: null,
    note: "辅源 §4 合规风险词(平台审核高危)",
  },

  // ── 存档(disabled):辅源冲突条目的更正说明 ──
  {
    slug: "archived-brand-words",
    tier: "empirical",
    category: "其他",
    matchType: "word",
    pattern: "第三方品牌词",
    replacement: null,
    status: "disabled",
    note: "更正存档:辅源 §1「第三方品牌词一律禁(豆包/Kimi/Apple 等)」已被主源(2026-06-25/07-02 更新)更正为过严 —— AI 教学语境点名工具(Codex/Claude/豆包)属正常教学描述,可用于标题/标签/简介;真正的导流红线是站外联络方式 + 其他平台账号/水印(公约34)。故不 seed 品牌词 active 规则,本行仅留更正说明",
  },

  // ── doud+ 投放特有限流词(主源 2026-07-02 实测:自然流量过、doud+ 投流被拒)──
  {
    slug: "doudplus-weixin",
    tier: "doudplus",
    category: "导流",
    matchType: "word",
    pattern: "微信",
    replacement: "这个生态",
    note: "doud+ 竞品平台生态词(2026-07-02 实测,209b 案例:自然流量 33+ 次过审、投流被拒);要投 doud+ 就避开或密度 ≤3 次",
  },
  {
    slug: "doudplus-tengxun",
    tier: "doudplus",
    category: "导流",
    matchType: "word",
    pattern: "腾讯",
    replacement: "对手家",
    note: "doud+ 竞品平台生态词(2026-07-02 实测)",
  },
  {
    slug: "doudplus-echang",
    tier: "doudplus",
    category: "导流",
    matchType: "word",
    pattern: "鹅厂",
    replacement: "对手家",
    note: "doud+ 竞品平台生态词(2026-07-02 实测)",
  },
  {
    slug: "doudplus-xiaochengxu",
    tier: "doudplus",
    category: "导流",
    matchType: "word",
    pattern: "小程序",
    replacement: "这个生态的轻应用",
    note: "doud+ 竞品平台生态词(2026-07-02 实测;含「微信小程序」)",
  },
  {
    slug: "doudplus-xiaowei",
    tier: "doudplus",
    category: "导流",
    matchType: "word",
    pattern: "小微",
    replacement: null,
    note: "doud+ 竞品平台生态词(2026-07-02 实测);注意「小微企业」等正常用法会误报,视语境判断",
  },
  {
    slug: "doudplus-nuojiang",
    tier: "doudplus",
    category: "其他",
    matchType: "word",
    pattern: "诺奖",
    replacement: "具体研究者与年代(如「50 年前 Simon 的研究」)",
    note: "doud+ 权威背书词(2026-07-02 实测,2a28 案例:「诺奖得主」5+ 次命中被拒);机制推测为公约33 不当营销的扩展",
  },
  {
    slug: "doudplus-nobel-cn",
    tier: "doudplus",
    category: "其他",
    matchType: "word",
    pattern: "诺贝尔奖",
    replacement: "具体研究者与年代",
    note: "doud+ 权威背书词(2026-07-02 实测)",
  },
  {
    slug: "doudplus-nobel-en",
    tier: "doudplus",
    category: "其他",
    matchType: "word",
    pattern: "Nobel",
    replacement: "具体研究者与年代",
    note: "doud+ 权威背书词(2026-07-02 实测)",
  },
  {
    slug: "doudplus-yuanshi",
    tier: "doudplus",
    category: "其他",
    matchType: "word",
    pattern: "院士",
    replacement: "该领域研究者",
    note: "doud+ 权威背书词(2026-07-02 实测)",
  },
  {
    slug: "doudplus-keji-award",
    tier: "doudplus",
    category: "其他",
    matchType: "word",
    pattern: "国家科技进步奖",
    replacement: "具体成果名",
    note: "doud+ 权威背书词(2026-07-02 实测)",
  },
];

/** 把种子清单物化成某用户的 review_rules 行(id 确定性 → onConflictDoNothing 幂等)。 */
export function buildReviewRuleSeedRows(
  userId: string,
  now: string,
): ReviewRuleRow[] {
  return SEED_RULES.map((s) => ({
    id: `rrule-seed-${userId}-${s.slug}`,
    userId,
    groupId: null,
    tier: s.tier,
    category: s.category,
    matchType: s.matchType,
    pattern: s.pattern,
    replacement: s.replacement,
    note: s.note,
    source: "seed",
    status: s.status ?? "active",
    createdAt: now,
    updatedAt: now,
  }));
}

/** 种子条数(测试断言用):{ total, official, empirical, doudplus }。 */
export const REVIEW_RULE_SEED_COUNTS = {
  total: SEED_RULES.length,
  official: SEED_RULES.filter((s) => s.tier === "official_hard").length,
  empirical: SEED_RULES.filter((s) => s.tier === "empirical").length,
  doudplus: SEED_RULES.filter((s) => s.tier === "doudplus").length,
} as const;
