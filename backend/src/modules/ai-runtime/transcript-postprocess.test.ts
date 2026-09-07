import { GenerationFailure } from "../../../../ai-worker/src/execution/generation-error";
import { describe, it, expect, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec } from "@creatoros/ai-worker";
import { LlmCredentialError } from "./llm/provider";
import {
  runTranscriptPostprocess,
  normalizeForFidelity,
  boundedEditDistance,
  checkTranscriptFidelity,
  TRANSCRIPT_POSTPROCESS_CAPABILITY,
  type TranscriptPostprocessDeps,
} from "./transcript-postprocess";

// [T-357] 采集逐字稿后处理单测 —— 全 fake(fake resolveModelSpec / callStructured 逃生口),
// 不碰真模型。覆盖:纠正生效 / 失败落原文 / 越权改写被拒 / 未配模型跳过 / 输出异常落原文 /
// 保真护栏纯函数(长度比 + 编辑距离阈值)/ 上下文可选注入。

const ctx: RequestContext = { userId: "u1", requestId: "r1", source: "user" };

const SPEC: ModelSpec = {
  apiFormat: "openai_chat",
  baseUrl: "https://fake.example/v1",
  model: "fake-model",
  token: "sk-fake",
};

// ASR 味原文:无标点、含同音错字(「定为」应为「定位」,「知识付废」应为「知识付费」)。
const RAW =
  "大家好今天我们聊一聊账号定为的问题很多人做知识付废都没想清楚自己的定为是什么" +
  "所以内容越做越散今天我给你三个判断标准第一看你的受众是谁第二看你能持续输出什么" +
  "第三看市场愿不愿意为它买单";

// 合法校正稿:同音错字改回 + 补标点 + 分段(归一化后与原文几乎等长)。
const CORRECTED =
  "大家好,今天我们聊一聊账号定位的问题。很多人做知识付费,都没想清楚自己的定位是什么,所以内容越做越散。\n\n" +
  "今天我给你三个判断标准:第一,看你的受众是谁;第二,看你能持续输出什么;第三,看市场愿不愿意为它买单。";

function makeDeps(opts: {
  resolveThrows?: Error;
  correctedText?: unknown;
  callThrows?: Error;
}) {
  const resolveModelSpec = vi.fn(async (_c: RequestContext, _cap: string) => {
    if (opts.resolveThrows) throw opts.resolveThrows;
    return SPEC;
  });
  const callStructured = vi.fn(
    async (_input: {
      spec: ModelSpec;
      facets: Readonly<Record<string, string | undefined>>;
    }) => {
      if (opts.callThrows) throw opts.callThrows;
      return { correctedText: opts.correctedText };
    },
  );
  const deps: TranscriptPostprocessDeps = { resolveModelSpec, callStructured };
  return { deps, resolveModelSpec, callStructured };
}

describe("保真护栏纯函数(checkTranscriptFidelity)", () => {
  it("normalizeForFidelity 剔除空白+标点:补标点/换行在归一化后不可见", () => {
    expect(normalizeForFidelity("你好,世界!\n\n第二段。")).toBe(
      "你好世界第二段",
    );
    expect(normalizeForFidelity(RAW)).toBe(normalizeForFidelity(CORRECTED.replace(/定位/g, "定为").replace(/知识付费/g, "知识付废")));
  });

  it("boundedEditDistance:等串 0 / 单字替换 1 / 超上限早停返回 maxDist+1", () => {
    expect(boundedEditDistance("abc", "abc", 5)).toBe(0);
    expect(boundedEditDistance("定为", "定位", 5)).toBe(1);
    expect(boundedEditDistance("aaaaaaaaaa", "bbbbbbbbbb", 3)).toBe(4); // 真距离 10 > 3 → 早停
    expect(boundedEditDistance("abcd", "ab", 1)).toBe(2); // 长度差 2 > 1 → 直接 maxDist+1
  });

  it("合法校正(错字替换+补标点+分段)通过保真校验", () => {
    expect(checkTranscriptFidelity(RAW, CORRECTED).ok).toBe(true);
  });

  it("空输出被拒", () => {
    const v = checkTranscriptFidelity(RAW, "   ");
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("空");
  });

  it("长度骤缩(模型只回一句总结)被拒 —— 长度比越界", () => {
    const v = checkTranscriptFidelity(RAW, "本文讲了账号定位的三个判断标准。");
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("长度比");
  });

  it("整段改写(等长但措辞全换)被拒 —— 编辑距离超阈值", () => {
    // 与原文归一化长度相当(长度比过关),但内容完全重写 → 编辑距离必超 15%。
    const rewrite =
      "各位朋友本期视频带你系统梳理个人品牌的底层逻辑并且给出可以直接落地的行动清单" +
      "帮助你在三个月内完成从零到一的跨越我们先从人群画像讲起然后是供给能力最后是变现路径" +
      "整体框架非常清晰建议收藏反复观看";
    const v = checkTranscriptFidelity(RAW, rewrite);
    expect(v.ok).toBe(false);
    expect(v.reason).toContain("编辑距离");
  });
});

describe("runTranscriptPostprocess(T-357)", () => {
  it("纠正生效:fake 模型返回合法校正稿 → applied:true + 校正稿;capability=video.subtitles", async () => {
    const { deps, resolveModelSpec, callStructured } = makeDeps({
      correctedText: CORRECTED,
    });
    const r = await runTranscriptPostprocess(ctx, { transcript: RAW }, deps);
    expect(r.applied).toBe(true);
    expect(r.transcript).toBe(CORRECTED);
    expect(resolveModelSpec).toHaveBeenCalledWith(
      ctx,
      TRANSCRIPT_POSTPROCESS_CAPABILITY,
    );
    expect(TRANSCRIPT_POSTPROCESS_CAPABILITY).toBe("video.subtitles");
    // facets 带原文;无上下文时 context 为空串(裸纠)。
    const facets = callStructured.mock.calls[0]![0].facets;
    expect(facets.transcript).toBe(RAW);
    expect(facets.context).toBe("");
  });

  it("上下文可选注入:账号定位/标题进 context facet(有就带)", async () => {
    const { deps, callStructured } = makeDeps({ correctedText: CORRECTED });
    await runTranscriptPostprocess(
      ctx,
      {
        transcript: RAW,
        accountPositioning: "帮独立创作者做知识付费",
        title: "账号定位三问",
      },
      deps,
    );
    const facets = callStructured.mock.calls[0]![0].facets;
    expect(facets.context).toContain("账号定位");
    expect(facets.context).toContain("帮独立创作者做知识付费");
    expect(facets.context).toContain("账号定位三问");
  });

  it("未配模型(LlmCredentialError)→ 跳过落原文,reason 注明未配置,不抛", async () => {
    const { deps, callStructured } = makeDeps({
      resolveThrows: new LlmCredentialError("no creds"),
    });
    const r = await runTranscriptPostprocess(ctx, { transcript: RAW }, deps);
    expect(r.applied).toBe(false);
    expect(r.transcript).toBe(RAW);
    if (!r.applied) expect(r.reason).toContain("模型未配置");
    expect(callStructured).not.toHaveBeenCalled();
  });

  it("模型调用失败 → 落原文不阻断,reason 带错误消息", async () => {
    const { deps } = makeDeps({ callThrows: new Error("HTTP 500 from provider") });
    const r = await runTranscriptPostprocess(ctx, { transcript: RAW }, deps);
    expect(r.applied).toBe(false);
    expect(r.transcript).toBe(RAW);
    if (!r.applied) expect(r.reason).toContain("HTTP 500");
  });

  it("越权改写(长度骤缩)→ 保真护栏拒之,落原文", async () => {
    const { deps } = makeDeps({ correctedText: "一句话总结。" });
    const r = await runTranscriptPostprocess(ctx, { transcript: RAW }, deps);
    expect(r.applied).toBe(false);
    expect(r.transcript).toBe(RAW);
    if (!r.applied) expect(r.reason).toContain("保真");
  });

  it("输出形状异常(correctedText 非 string)→ 落原文", async () => {
    const { deps } = makeDeps({ correctedText: 42 });
    const r = await runTranscriptPostprocess(ctx, { transcript: RAW }, deps);
    expect(r.applied).toBe(false);
    expect(r.transcript).toBe(RAW);
  });

  it("原文为空 → 直接跳过(不解析模型、不调用)", async () => {
    const { deps, resolveModelSpec } = makeDeps({ correctedText: CORRECTED });
    const r = await runTranscriptPostprocess(ctx, { transcript: "  " }, deps);
    expect(r.applied).toBe(false);
    expect(resolveModelSpec).not.toHaveBeenCalled();
  });
});

// T-915：真实控制结果不能被后处理降级吞掉。
describe("后处理取消边界", () => {
  it("解析期间取消后不再提交模型", async () => {
    const controller = new AbortController();
    const callStructured = vi.fn();
    const reason = new DOMException("已取消", "AbortError");
    await expect(runTranscriptPostprocess(ctx, {transcript: RAW, signal: controller.signal}, {
      resolveModelSpec: async () => { controller.abort(reason); return SPEC; }, callStructured,
    })).rejects.toBe(reason);
    expect(callStructured).not.toHaveBeenCalled();
  });
  it("调用接收同一 signal，取消后的成功返回不得采纳", async () => {
    const controller = new AbortController();
    const reason = new DOMException("已取消", "AbortError");
    await expect(runTranscriptPostprocess(ctx, {transcript: RAW, signal: controller.signal}, {
      resolveModelSpec: async () => SPEC,
      callStructured: async input => { expect(input.signal).toBe(controller.signal); controller.abort(reason); return {correctedText: CORRECTED}; },
    })).rejects.toBe(reason);
  });
});

it("后处理运行时保持已知未知账本结果", async () => {
 const error = new GenerationFailure('unknown_result', 'MODEL_RESULT_UNKNOWN');
 await expect(runTranscriptPostprocess(ctx,{transcript: RAW},{resolveModelSpec:async()=>SPEC,callStructured:async()=>{throw error;}})).rejects.toBe(error);
});
