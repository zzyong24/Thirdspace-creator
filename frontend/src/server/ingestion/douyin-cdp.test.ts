import { describe, it, expect } from "vitest";
import {
  parseWorkList,
  parseDetail,
  toMetricRecords,
  parseCommentList,
  ingestComments,
  type DouyinDetail,
  type CommentRecord,
  type CommentIngestPorts,
} from "./douyin-cdp";

// 真实 work_list XHR 形状的 fixture(对齐 cheat-on-content 抓到的字段)。
const WORK_LIST = {
  aweme_list: [
    {
      aweme_id: "7400000000000000001",
      desc: "为什么你的 Agent 总跑偏",
      create_time: 1717000000,
      video: { duration: 185000 },
      statistics: {
        play_count: 128000,
        digg_count: 5400,
        comment_count: 320,
        share_count: 210,
        collect_count: 1800,
      },
    },
    {
      // 字段缺失 / 字符串数字 → 兜底取 0 / 解析。
      item_id: "7400000000000000002",
      title: "RAG 最小实现",
      statistics: { play_count: "86,000", digg_count: 3100 },
    },
    { desc: "无 id 的脏数据应被丢弃" },
  ],
  has_more: false,
};

describe("douyin-cdp 纯函数", () => {
  it("parseWorkList 抽取作品 + 字段兜底 + 丢弃无 id", () => {
    const works = parseWorkList(WORK_LIST);
    expect(works).toHaveLength(2); // 第三条无 id 被丢
    const [a, b] = works;
    expect(a.awemeId).toBe("7400000000000000001");
    expect(a.stats.views).toBe(128000);
    expect(a.stats.favorites).toBe(1800);
    expect(a.durationSec).toBe(185); // 185000ms → 185s
    // 第二条:item_id 兜底 + 字符串 "86,000" → 86000 + 缺失字段 → 0
    expect(b.awemeId).toBe("7400000000000000002");
    expect(b.stats.views).toBe(86000);
    expect(b.stats.comments).toBe(0);
  });

  it("parseWorkList 对空/脏 JSON 容错(返回 [])", () => {
    expect(parseWorkList(null)).toEqual([]);
    expect(parseWorkList({})).toEqual([]);
    expect(parseWorkList({ aweme_list: "not-an-array" })).toEqual([]);
  });

  it("parseDetail 抽完播/转粉 + 缺字段记 null", () => {
    const d1 = parseDetail(
      { data: { finish_rate: 0.42, fans_increment: 120 } },
      "7400000000000000001",
    );
    expect(d1.finishRate).toBe(0.42);
    expect(d1.followerGain).toBe(120);
    const d2 = parseDetail({}, "x");
    expect(d2.finishRate).toBeNull();
    expect(d2.followerGain).toBeNull();
  });

  it("toMetricRecords 映射成 MetricRecord(键名对齐 seed,detail 可选合并)", () => {
    const works = parseWorkList(WORK_LIST);
    const details = new Map<string, DouyinDetail>([
      [
        "7400000000000000001",
        { awemeId: "7400000000000000001", finishRate: 0.42, followerGain: 120 },
      ],
    ]);
    const records = toMetricRecords(works, details, "2026-06-29T00:00:00.000Z");
    expect(records).toHaveLength(2);
    const r0 = records[0];
    expect(r0.platform).toBe("douyin");
    expect(r0.externalId).toBe("7400000000000000001");
    expect(r0.capturedAt).toBe("2026-06-29T00:00:00.000Z");
    expect(r0.metrics).toMatchObject({
      views: 128000,
      likes: 5400,
      comments: 320,
      shares: 210,
      favorites: 1800,
      finish_rate: 0.42,
      follower_gain: 120,
    });
    // 第二条无 detail → 不含 finish_rate/follower_gain 键。
    expect(records[1].metrics.finish_rate).toBeUndefined();
    expect(records[1].metrics.views).toBe(86000);
  });
});

// 真实创作者中心评论 list XHR 形状的 fixture(对齐 cheat-on-content
// `_normalize_comment_creator`:cid / text / digg_count / create_time / user.nickname)。
const COMMENT_LIST = {
  comments: [
    {
      cid: "7500000000000000001",
      aweme_id: "7400000000000000001",
      text: "这个 Agent 教程太实用了,求一期 RAG 落地",
      digg_count: 42,
      reply_comment_total: 3,
      create_time: 1717001000,
      user: { uid: "u-1", nickname: "小明产品笔记" },
      ip_label: "浙江",
    },
    {
      // 字段缺失 / 别名键(comment_id / content / like_count)→ 兜底解析。
      comment_id: "7500000000000000002",
      item_id: "7400000000000000001",
      content: "第二条评论用 content 字段",
      like_count: 7,
      user_info: { user_id: "u-2", name: "阿强" },
    },
    { cid: "", text: "无 cid 脏数据丢弃" }, // 无 commentId → 丢
    { cid: "7500000000000000003", text: "   " }, // 正文空白 → 丢(rawText 不能空)
  ],
};

describe("parseCommentList 纯函数(评论解析,T-007 D2)", () => {
  it("抽取评论 + 字段兜底 + 丢弃无 id/空正文", () => {
    const comments = parseCommentList(COMMENT_LIST);
    expect(comments).toHaveLength(2); // 后两条脏数据被丢
    const [a, b] = comments;
    expect(a.commentId).toBe("7500000000000000001");
    expect(a.awemeId).toBe("7400000000000000001");
    expect(a.text).toContain("Agent 教程");
    expect(a.likeCount).toBe(42);
    expect(a.replyCount).toBe(3);
    expect(a.createTime).toBe(1717001000);
    expect(a.userId).toBe("u-1");
    expect(a.userName).toBe("小明产品笔记");
    expect(a.ipLabel).toBe("浙江");
    // 第二条:comment_id / content / like_count / user_info 别名键兜底 + 缺失字段 → 0/""
    expect(b.commentId).toBe("7500000000000000002");
    expect(b.text).toBe("第二条评论用 content 字段");
    expect(b.likeCount).toBe(7);
    expect(b.replyCount).toBe(0);
    expect(b.createTime).toBe(0);
    expect(b.userName).toBe("阿强");
    expect(b.ipLabel).toBe("");
  });

  it("defaultAwemeId 兜底(评论体无 aweme_id/item_id 时)", () => {
    const comments = parseCommentList(
      { comments: [{ cid: "c9", text: "无作品 id 的评论" }] },
      "7400000000000000009",
    );
    expect(comments[0].awemeId).toBe("7400000000000000009");
  });

  it("对空/脏 JSON 容错(返回 []),并支持 comment_list / data.comments 键", () => {
    expect(parseCommentList(null)).toEqual([]);
    expect(parseCommentList({})).toEqual([]);
    expect(parseCommentList({ comments: "not-an-array" })).toEqual([]);
    // comment_list 别名键
    expect(
      parseCommentList({ comment_list: [{ cid: "c1", text: "x" }] }),
    ).toHaveLength(1);
    // data.comments 嵌套键
    expect(
      parseCommentList({ data: { comments: [{ cid: "c2", text: "y" }] } }),
    ).toHaveLength(1);
  });
});

// fake CommentIngestPorts:内存模拟 run + ux_ingestion_records_run_key 去重 + 信号写。
function makeFakePorts() {
  const signals: Array<{ source: string; rawText: string; runId: string }> = [];
  const ledger = new Set<string>(); // `${runId}::${recordKey}` = ux 去重锚
  const runs = new Map<string, string>(); // idempotencyKey → runId(建 run 幂等)
  let runSeq = 0;
  const calls = { createRun: 0, ingestSignal: 0, completeRun: 0 };
  const ports: CommentIngestPorts = {
    async createRun(input) {
      calls.createRun += 1;
      const existing = runs.get(input.idempotencyKey);
      if (existing) return { id: existing }; // 同幂等键取回原 run
      const id = `run-${++runSeq}`;
      runs.set(input.idempotencyKey, id);
      return { id };
    },
    async recordExists(runId, recordKey) {
      return ledger.has(`${runId}::${recordKey}`);
    },
    async markRecordWritten(runId, recordKey) {
      ledger.add(`${runId}::${recordKey}`);
    },
    async ingestSignal(input) {
      calls.ingestSignal += 1;
      signals.push({
        source: input.source,
        rawText: input.rawText,
        runId: input.ingestionRunId,
      });
    },
    async completeRun() {
      calls.completeRun += 1;
    },
  };
  return { ports, signals, calls };
}

const CMT_FIXTURE: CommentRecord[] = [
  {
    commentId: "c-1",
    awemeId: "7400",
    text: "求 RAG 落地教程",
    likeCount: 42,
    replyCount: 3,
    createTime: 1717001000,
    userId: "u-1",
    userName: "小明",
    ipLabel: "浙江",
  },
  {
    commentId: "c-2",
    awemeId: "7400",
    text: "这条能变现吗",
    likeCount: 7,
    replyCount: 0,
    createTime: 1717002000,
    userId: "u-2",
    userName: "阿强",
    ipLabel: "",
  },
];

describe("ingestComments 落库 helper(fake ports,T-007 D2)", () => {
  it("建 run → 逐条评论写 audience_signal(source=comment) → completeRun", async () => {
    const { ports, signals, calls } = makeFakePorts();
    const res = await ingestComments("7400", CMT_FIXTURE, {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    });
    expect(res.received).toBe(2);
    expect(res.written).toBe(2);
    expect(res.skipped).toBe(0);
    expect(signals).toHaveLength(2);
    // C-4:每条信号 source=comment 且带真 run id。
    expect(signals.every((s) => s.source === "comment")).toBe(true);
    expect(signals.every((s) => s.runId === res.runId)).toBe(true);
    expect(signals[0].rawText).toBe("求 RAG 落地教程");
    expect(calls.completeRun).toBe(1);
  });

  it("幂等:同评论(同 run 幂等键)跑两次只写一次(record_key 去重锚)", async () => {
    const { ports, signals } = makeFakePorts();
    const deps = {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    };
    const first = await ingestComments("7400", CMT_FIXTURE, deps);
    expect(first.written).toBe(2);
    // 第二次同源同刻 → 取回同一 run,record_key 全命中 → 全跳过,不重复写信号。
    const second = await ingestComments("7400", CMT_FIXTURE, deps);
    expect(second.runId).toBe(first.runId); // 同一 run(建 run 幂等)
    expect(second.written).toBe(0);
    expect(second.skipped).toBe(2);
    expect(signals).toHaveLength(2); // 总信号数仍为 2,未翻倍
  });

  it("部分重复:混入 1 条新评论 → 只写新的那条", async () => {
    const { ports, signals } = makeFakePorts();
    const deps = {
      ports,
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    };
    await ingestComments("7400", CMT_FIXTURE, deps);
    const withNew: CommentRecord[] = [
      ...CMT_FIXTURE,
      { ...CMT_FIXTURE[0], commentId: "c-3", text: "全新评论" },
    ];
    const res = await ingestComments("7400", withNew, deps);
    expect(res.written).toBe(1); // 只有 c-3 是新的
    expect(res.skipped).toBe(2); // c-1 / c-2 命中已写
    expect(signals).toHaveLength(3); // 累计 3 条(2 原 + 1 新)
    expect(signals[2].rawText).toBe("全新评论");
  });
});
