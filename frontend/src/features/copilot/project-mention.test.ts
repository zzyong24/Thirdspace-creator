import { describe, it, expect } from "vitest";
import {
  detectMentionQuery,
  filterProjectOptions,
  applyProjectMention,
} from "./project-mention";

// @项目引用纯逻辑单测(T-039b item①)—— active @query 检测 / 过滤 / 应用替换。UI + 装配在
// ai-copilot-interactions.test.tsx;这里锁纯函数(检测边界最容易出细节 bug)。

describe("detectMentionQuery — active @query 检测", () => {
  it("光标处在行首 @ 之后 → 命中,返回范围 + 查询串", () => {
    const value = "@上下"; // 长度 3(@ + 上 + 下)。
    const m = detectMentionQuery(value, value.length);
    expect(m).toEqual({ active: true, start: 0, end: 3, query: "上下" });
  });

  it("@ 前是空白(句中提及)→ 命中", () => {
    const value = "帮我基于 @RAG";
    const m = detectMentionQuery(value, value.length);
    expect(m.active).toBe(true);
    if (m.active) expect(m.query).toBe("RAG");
  });

  it("刚打出 @(空查询)→ 命中,query 为空串(弹全部候选)", () => {
    const value = "看看 @";
    const m = detectMentionQuery(value, value.length);
    expect(m.active).toBe(true);
    if (m.active) expect(m.query).toBe("");
  });

  it("@ 前紧贴非空白(如 email name@host)→ 不命中(不是提及)", () => {
    const value = "me@host";
    const m = detectMentionQuery(value, value.length);
    expect(m.active).toBe(false);
  });

  it("@ 与光标间有空白(提及已结束)→ 不命中", () => {
    const value = "@上下 文";
    const m = detectMentionQuery(value, value.length);
    expect(m.active).toBe(false);
  });

  it("光标不在 @ token 内(前面无 @)→ 不命中", () => {
    const value = "普通输入没有提及";
    const m = detectMentionQuery(value, value.length);
    expect(m.active).toBe(false);
  });

  it("光标落在 @token 中间 → 按光标位置截取查询串(只到光标)", () => {
    const value = "@上下文工程";
    // 光标停在「@上下」后(index 3),query 只应是「上下」。
    const m = detectMentionQuery(value, 3);
    expect(m.active).toBe(true);
    if (m.active) {
      expect(m.query).toBe("上下");
      expect(m.end).toBe(3);
    }
  });

  it("越界 caret → 安全返回不命中", () => {
    expect(detectMentionQuery("@x", -1).active).toBe(false);
    expect(detectMentionQuery("@x", 99).active).toBe(false);
  });
});

describe("filterProjectOptions — 标题模糊过滤", () => {
  const opts = [
    { id: "p1", title: "上下文工程" },
    { id: "p2", title: "RAG 检索优化" },
    { id: "p3", title: "rag 入门" },
  ];

  it("空查询 → 返回全部(顺序不变)", () => {
    expect(filterProjectOptions(opts, "")).toEqual(opts);
    expect(filterProjectOptions(opts, "   ")).toEqual(opts);
  });

  it("大小写不敏感的子串匹配", () => {
    const r = filterProjectOptions(opts, "rag");
    expect(r.map((o) => o.id)).toEqual(["p2", "p3"]);
  });

  it("无匹配 → 空数组(诚实,不回退全部)", () => {
    expect(filterProjectOptions(opts, "不存在")).toEqual([]);
  });
});

describe("applyProjectMention — @ 只选择上下文，不写进消息正文", () => {
  it("移除 [start,end) 的 @query，并返回清理后光标位置", () => {
    // 贴合真实检测:提及 token 不含尾随空白 —— 光标就在查询串末尾(「下」后,index 8)。
    const value = "帮我基于 @上下";
    // @上下 的范围:start=5(@),end=8(串末,= value.length)。
    const range = { start: 5, end: value.length };
    const r = applyProjectMention(value, range, {
      id: "p1",
      title: "上下文工程",
    });
    expect(r.value).toBe("帮我基于 ");
    expect(r.caret).toBe(5);
  });

  it("token 位于句中且两侧都有空格 → 不留下双空格", () => {
    const value = "看看 @RAG 怎么样";
    const range = { start: 3, end: 7 };
    const r = applyProjectMention(value, range, { id: "p2", title: "RAG" });
    expect(r.value).toBe("看看 怎么样");
    expect(r.caret).toBe(3);
  });
});
