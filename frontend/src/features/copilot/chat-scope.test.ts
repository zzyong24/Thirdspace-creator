/**
 * [T-096] resolveChatScope 真值表单测 —— SPEC 2026-07-03 chat-session-scope-contract §1.2
 * 「入口 → scope 总表」的穷举验证(12 个入口逐一对应),外加文法校验与防泄漏矩阵
 * #5/#7 的纯函数面(不同入口分桶 / 同项目入口归并同桶)。
 */

import { describe, expect, it } from "vitest";
import {
  GLOBAL_SCOPE,
  KNOWLEDGE_DISTILL_SCOPE,
  isValidScope,
  projectScope,
  surfaceScope,
  resolveChatScope,
  scopeHistoryLabel,
} from "./chat-scope";

describe("scope 文法(isValidScope)", () => {
  it("合法:global / project:<id> / surface:<name> / surface:<name>:<entityId>", () => {
    expect(isValidScope("global")).toBe(true);
    expect(isValidScope("project:proj-1")).toBe(true);
    expect(isValidScope("surface:topics")).toBe(true);
    // 扩展位:只定文法(前缀合法即过),本期不启用任何入口。
    expect(isValidScope("surface:knowledge-distill:item-9")).toBe(true);
  });

  it("非法:空串 / 裸前缀 / 未知桶名 / 非字符串", () => {
    expect(isValidScope("")).toBe(false);
    expect(isValidScope("project:")).toBe(false);
    expect(isValidScope("surface:")).toBe(false);
    expect(isValidScope("topics")).toBe(false);
    expect(isValidScope(undefined)).toBe(false);
    expect(isValidScope(null)).toBe(false);
  });
});

describe("resolveChatScope — §1.2 入口→scope 总表(穷举)", () => {
  it("#1 左下角侧栏(?scope=global 显式声明)→ global", () => {
    expect(resolveChatScope({ scopeParam: "global" })).toBe(GLOBAL_SCOPE);
  });

  it("#2 首页 AI 助手条(同 #1 显式 scope=global)→ global(与 #1 同桶)", () => {
    expect(
      resolveChatScope({ scopeParam: "global", urlSurface: null }),
    ).toBe(GLOBAL_SCOPE);
  });

  it("旧深链兼容:裸 ?copilot=open(无 scope/surface/selection)→ global,绝不借 topics 桶", () => {
    expect(resolveChatScope({})).toBe(GLOBAL_SCOPE);
    expect(
      resolveChatScope({ scopeParam: null, urlSurface: null, selKind: null }),
    ).toBe(GLOBAL_SCOPE);
  });

  it("#4 选题一键岛(surface=topics)→ surface:topics(与 global 分桶)", () => {
    expect(resolveChatScope({ urlSurface: "topics" })).toBe("surface:topics");
    expect(resolveChatScope({ urlSurface: "topics" })).not.toBe(GLOBAL_SCOPE);
  });

  it("#5 校准诊断(surface=calibration + 非项目 selection)→ surface:calibration(诊断对象不另分桶)", () => {
    expect(
      resolveChatScope({
        urlSurface: "calibration",
        selKind: "publication",
        selId: "pub-1",
      }),
    ).toBe("surface:calibration");
  });

  it("#6 定位提案(surface=positioning)→ surface:positioning", () => {
    expect(resolveChatScope({ urlSurface: "positioning" })).toBe(
      "surface:positioning",
    );
  });

  it("#7 复盘一键岛(surface=review + selKind=project)→ project:<id>(归并,与右栏同源)", () => {
    expect(
      resolveChatScope({
        urlSurface: "review",
        selKind: "project",
        selId: "proj-9",
      }),
    ).toBe("project:proj-9");
  });

  it("#8 记一条经验(surface=experience)→ surface:experience", () => {
    expect(resolveChatScope({ urlSurface: "experience" })).toBe(
      "surface:experience",
    );
  });

  it("#9/#10 稿面右栏 / 复盘页右栏(embed persistKey=project:<id>)→ project:<id>(持平)", () => {
    expect(
      resolveChatScope({
        embed: { surface: "project", persistKey: "project:proj-9" },
      }),
    ).toBe("project:proj-9");
  });

  it("#11 选题卡 brief.fill 深链(surface=project + selKind=project)→ project:<id>(修裸 project 桶 bug)", () => {
    const scope = resolveChatScope({
      urlSurface: "project",
      selKind: "project",
      selId: "proj-9",
    });
    expect(scope).toBe("project:proj-9");
    // 修 bug 断言:绝不再落进裸 `project` 桶(surface:project)。
    expect(scope).not.toBe("surface:project");
  });

  it("#12 倾倒场蒸馏预留位(surface=knowledge-distill)→ surface:knowledge-distill(T-094 即插)", () => {
    expect(resolveChatScope({ urlSurface: "knowledge-distill" })).toBe(
      KNOWLEDGE_DISTILL_SCOPE,
    );
  });

  // ── [T-121] 选题候选对象级隔离(引用对象变了 → 开新窗口)──────────────────
  it("[T-121] 选题候选(surface=topics + selKind=candidate + selId)→ surface:topics:<candidateId> 对象级桶", () => {
    expect(
      resolveChatScope({
        urlSurface: "topics",
        selKind: "candidate",
        selId: "cand-1",
      }),
    ).toBe("surface:topics:cand-1");
  });

  it("[T-121] 换引用的选题 → 换桶(cand-1 ≠ cand-2,旧上下文不污染新引用)", () => {
    const a = resolveChatScope({
      urlSurface: "topics",
      selKind: "candidate",
      selId: "cand-1",
    });
    const b = resolveChatScope({
      urlSurface: "topics",
      selKind: "candidate",
      selId: "cand-2",
    });
    expect(a).not.toBe(b);
    // 且都不落回旧的公共 surface:topics 桶(否则又串味)。
    expect(a).not.toBe("surface:topics");
    expect(b).not.toBe("surface:topics");
  });

  it("[T-121] candidate 但无 selId → 回落公共 surface 桶(不造 surface:topics: 空桶)", () => {
    expect(
      resolveChatScope({ urlSurface: "topics", selKind: "candidate" }),
    ).toBe("surface:topics");
  });

  it("[T-121] 非 candidate 的选中(如 publication)不启用对象级隔离 → 仍公共 surface 桶", () => {
    expect(
      resolveChatScope({
        urlSurface: "topics",
        selKind: "publication",
        selId: "pub-1",
      }),
    ).toBe("surface:topics");
  });

  it("[T-121] project 选中仍归并 project:<id>(不受对象级隔离影响)", () => {
    expect(
      resolveChatScope({
        urlSurface: "topics",
        selKind: "project",
        selId: "proj-9",
      }),
    ).toBe("project:proj-9");
  });

  it("[T-121] 对象级桶文法合法(isValidScope 接受 3 段式)", () => {
    expect(isValidScope("surface:topics:cand-1")).toBe(true);
  });

  it("矩阵 #7:复盘一键岛与稿面右栏(同一项目)解析到同一 scope —— 同源是特性", () => {
    const island = resolveChatScope({
      urlSurface: "review",
      selKind: "project",
      selId: "proj-9",
    });
    const rail = resolveChatScope({
      embed: { surface: "project", persistKey: "project:proj-9" },
    });
    expect(island).toBe(rail);
  });

  it("矩阵 #5(纯函数面):蒸馏/选题/全局三个入口分属三个互不相同的桶", () => {
    const distill = resolveChatScope({ urlSurface: "knowledge-distill" });
    const topics = resolveChatScope({ urlSurface: "topics" });
    const global = resolveChatScope({});
    expect(new Set([distill, topics, global]).size).toBe(3);
  });

  it("防坏链:非法 ?scope= 声明被忽略,回落推导(不落垃圾桶名)", () => {
    expect(
      resolveChatScope({ scopeParam: "hacker", urlSurface: "topics" }),
    ).toBe("surface:topics");
    expect(resolveChatScope({ scopeParam: "project:" })).toBe(GLOBAL_SCOPE);
  });

  it("embed 无合法 persistKey 时:embed selection.kind=project → project:<id>;否则 surface:<embed.surface>", () => {
    expect(
      resolveChatScope({
        embed: {
          surface: "project",
          selection: { kind: "project", id: "proj-3" },
        },
      }),
    ).toBe("project:proj-3");
    expect(resolveChatScope({ embed: { surface: "somepane" } })).toBe(
      "surface:somepane",
    );
  });
});

describe("构造器与文案", () => {
  it("projectScope / surfaceScope 是唯一拼法", () => {
    expect(projectScope("p1")).toBe("project:p1");
    expect(surfaceScope("topics")).toBe("surface:topics");
  });

  it("历史面板范围提示按 scope 分档(中文,诚实标注范围)", () => {
    expect(scopeHistoryLabel("global")).toBe("全局助手的历史会话");
    expect(scopeHistoryLabel("project:p1")).toBe("本项目的历史会话");
    expect(scopeHistoryLabel("surface:topics")).toBe("本入口的历史会话");
    // [T-121] 对象级隔离桶 → 「本选题的历史会话」。
    expect(scopeHistoryLabel("surface:topics:cand-1")).toBe("本选题的历史会话");
  });
});
