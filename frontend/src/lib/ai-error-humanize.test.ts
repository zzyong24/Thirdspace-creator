import { describe, it, expect, vi, afterEach } from "vitest";
import {
  humanizeAiError,
  humanizeAiErrorMessage,
  describeUserError,
  humanizeArtifactType,
  ARTIFACT_TYPE_LABELS,
} from "./ai-error-humanize";
import type { ArtifactType } from "@/types/domain";

// [T-094] AI 错误人话化映射单测 —— 锚定实录错误串与规则表语义:
// 命中 → 人话 + suggestSwitchModel;不命中 → null(调用方回落原串,不装懂)。

describe("humanizeAiErrorMessage — 错误码 → 人话", () => {
  it("DeepSeek model not found → 稳定模型分类 + 设置指引", () => {
    const human = humanizeAiErrorMessage(
      "AI_APICallError: 404 model not found: deepseek-v4-flash",
    );
    expect(human).not.toBeNull();
    expect(human!.code).toBe("model_not_found");
    expect(human!.message).toContain("模型名");
    expect(human!.message).toContain("设置");
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("OpenAI model_not_found / does not exist 风格也归入同一模型分类", () => {
    for (const raw of [
      '{"error":{"code":"model_not_found","message":"The model was not found"}}',
      "The model 'gpt-4-retired' does not exist or you do not have access to it.",
      "invalid_model: unknown model",
    ]) {
      const human = humanizeAiErrorMessage(raw);
      expect(human?.code).toBe("model_not_found");
      expect(human?.message).not.toContain("要操作的内容");
    }
  });

  it("provider 名称无效与模型名无效分开分类", () => {
    const human = humanizeAiErrorMessage(
      "unsupported_provider: provider 'deepseek-v5' not found",
    );
    expect(human?.code).toBe("provider_invalid");
    expect(human?.message).toContain("模型服务商");
    expect(human?.suggestSwitchModel).toBe(true);
  });

  it("模型方 API Key 鉴权失败有独立分类", () => {
    for (const raw of [
      "AI_APICallError: invalid_api_key",
      "authentication_error: Incorrect API key provided",
    ]) {
      const human = humanizeAiErrorMessage(raw);
      expect(human?.code).toBe("provider_auth");
      expect(human?.message).toContain("API Key");
      expect(human?.suggestSwitchModel).toBe(true);
    }
  });

  it("实录主案例:MiniMax 输入敏感拦截(new_sensitive / 1026)→ 人话 + 建议换模型", () => {
    const raw =
      "Failed after 3 attempts. AI_APICallError: input new_sensitive (1026)";
    const human = humanizeAiErrorMessage(raw);
    expect(human).not.toBeNull();
    expect(human!.message).toContain("内容安全审核");
    expect(human!.message).toContain("换一个模型");
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("输出敏感(1027)→ 人话 + 建议换模型", () => {
    const human = humanizeAiErrorMessage("AI_APICallError: output new_sensitive (1027)");
    expect(human).not.toBeNull();
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("限流(rate limit / 1002)→ 人话,不强推换模型", () => {
    const human = humanizeAiErrorMessage("Request failed: rate limit exceeded (1002)");
    expect(human).not.toBeNull();
    expect(human!.code).toBe("rate_limited");
    expect(human!.message).toContain("限流");
    expect(human!.suggestSwitchModel).toBe(false);
  });

  it("余额/配额不足(1008 / insufficient balance)→ 人话 + 建议换模型", () => {
    const human = humanizeAiErrorMessage("insufficient balance (1008)");
    expect(human).not.toBeNull();
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("不命中规则 → null(诚实,不把未知错误装成人话)", () => {
    expect(humanizeAiErrorMessage("ECONNREFUSED 127.0.0.1:8080")).toBeNull();
    expect(humanizeAiErrorMessage("")).toBeNull();
  });
});

describe("humanizeAiError — Error/unknown 入口", () => {
  it("Error.message 命中 → 翻译", () => {
    const human = humanizeAiError(
      new Error("AI_APICallError: input new_sensitive (1026)"),
    );
    expect(human?.suggestSwitchModel).toBe(true);
  });

  it("平台码藏在 cause 里也能命中(AI SDK 包装层)", () => {
    const err = new Error("Failed after 3 attempts.");
    (err as Error & { cause: Error }).cause = new Error(
      "input new_sensitive (1026)",
    );
    expect(humanizeAiError(err)).not.toBeNull();
  });

  it("平台码藏在 responseBody 里也能命中", () => {
    const err = new Error("API call failed");
    (err as Error & { responseBody: string }).responseBody =
      '{"base_resp":{"status_code":1026,"status_msg":"input new_sensitive (1026)"}}';
    expect(humanizeAiError(err)).not.toBeNull();
  });

  it("非 Error / 不命中 → null", () => {
    expect(humanizeAiError("random failure")).toBeNull();
    expect(humanizeAiError(undefined)).toBeNull();
  });
});

// [T-133] 通用面向用户错误收口 —— 绝不把裸 err.message / 技术码渲给用户。
describe("describeUserError — 通用面向用户错误收口", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("AI 类错(命中 humanize)→ 返人话,不返裸串", () => {
    const err = new Error("AI_APICallError: input new_sensitive (1026)");
    expect(describeUserError(err)).toContain("内容安全审核");
  });

  it("普通未知错(识别不出)→ 返 fallback,绝不泄露裸 err.message", () => {
    const err = new Error("SomeInternalWidget failed: secret-token=abc frob=42");
    const out = describeUserError(err, "保存失败,请重试");
    expect(out).toBe("保存失败,请重试");
    expect(out).not.toContain("secret-token");
    expect(out).not.toContain("frob");
  });

  it("网络类裸串(ECONNREFUSED 等)→ 映射网络人话,不泄露原始细节", () => {
    const out = describeUserError(
      new Error("ECONNREFUSED 127.0.0.1:8080 secret-token=abc"),
    );
    expect(out).toContain("网络");
    expect(out).not.toContain("ECONNREFUSED");
    expect(out).not.toContain("secret-token");
  });

  it("不传 fallback → 用默认「操作失败,请重试」", () => {
    expect(describeUserError(new Error("boom"))).toBe("操作失败，请重试。");
  });

  it("结构化码 401/鉴权失败 → 映射人话", () => {
    const out = describeUserError(new Error("HTTP 401 Unauthorized"));
    expect(out).toContain("登录");
    expect(out).not.toContain("API Key");
  });

  it("结构化码 404 → 映射「已不存在」类人话", () => {
    const out = describeUserError(new Error("Request failed: 404 Not Found"));
    expect(out).toContain("不存在");
  });

  it("AI API endpoint 的 404 不冒充「内容已不存在」", () => {
    const out = describeUserError(
      new Error("AI_APICallError: 404 Not Found /v1/chat/completions"),
      "模型请求失败,请检查配置。",
    );
    expect(out).toBe("模型请求失败,请检查配置。");
    expect(out).not.toContain("要操作的内容");
  });

  it("通用 HTTP 429 不冒充模型方限流", () => {
    const out = describeUserError(new Error("HTTP 429 Too Many Requests"));
    expect(out).toBe("操作太频繁了,请稍等片刻再试。");
    expect(out).not.toContain("模型方");
  });

  it("网络错(Failed to fetch / NetworkError)→ 映射网络人话", () => {
    expect(describeUserError(new TypeError("Failed to fetch"))).toContain(
      "网络",
    );
  });

  it("dev 环境把原始 err 打 console.error(便于排查),但不返给用户", () => {
    vi.stubEnv("NODE_ENV", "development");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("raw-technical-detail-xyz");
    const out = describeUserError(err, "上传失败,请重试");
    expect(out).toBe("上传失败,请重试");
    expect(spy).toHaveBeenCalled();
    // console 收到的是原始 err;返回给用户的绝不含它。
    expect(out).not.toContain("raw-technical-detail-xyz");
  });

  it("prod 环境不把原始 err 打 console(避免噪音/泄露)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    describeUserError(new Error("boom"), "失败");
    expect(spy).not.toHaveBeenCalled();
  });

  it("非 Error(字符串/undefined)也安全收口成 fallback", () => {
    expect(describeUserError("some raw string", "失败了")).toBe("失败了");
    expect(describeUserError(undefined)).toBe("操作失败，请重试。");
  });

  it("后端刻意抛的中文人话短句 → 透传(策展文案,非裸机器码)", () => {
    // 后端为特定流程精心写的面向用户中文短句应保留(否则丢掉「去配凭据」等指引)。
    expect(describeUserError(new Error("无可用 LLM 凭据"))).toBe(
      "无可用 LLM 凭据",
    );
    expect(describeUserError(new Error("阶段核心交付物缺失"))).toBe(
      "阶段核心交付物缺失",
    );
  });

  it("含技术噪声的字符串即使有中文也不透传(防裸吐)", () => {
    // 栈帧 / 英文 Error / 下划线标识符 / 长码 / JSON 花括号 —— 一律回落 fallback。
    expect(
      describeUserError(new Error("保存失败 at parseChunk (index.js:12)"), "失败"),
    ).toBe("失败");
    expect(
      describeUserError(new Error('失败 {"code":"E_INTERNAL"}'), "失败"),
    ).toBe("失败");
    expect(
      describeUserError(new Error("失败 AI_APICallError xyz"), "失败"),
    ).toBe("失败");
    // 过长的中文串(多半是拼接/堆栈)也不透传。
    expect(
      describeUserError(
        new Error("这是一个非常非常非常非常非常非常非常非常非常长的错误描述串超过四十字上限了真的很长"),
        "失败",
      ),
    ).toBe("失败");
  });
});

// [T-133] artifactType → 中文 术语映射 —— UI 一律走它,不渲内部类型码。
describe("humanizeArtifactType — 产物类型码 → 中文", () => {
  it("常见类型映射到中文", () => {
    expect(humanizeArtifactType("output_script")).toBe("成片脚本");
    expect(humanizeArtifactType("master_script")).toBe("母本脚本");
    expect(humanizeArtifactType("thesis_tree")).toBe("论点树");
    expect(humanizeArtifactType("content_outline")).toBe("内容大纲");
    expect(humanizeArtifactType("content_contract")).toBe("内容合同");
    expect(humanizeArtifactType("review_report")).toBe("复盘报告");
  });

  it("全部 ArtifactType 枚举都有词条(编译期穷尽 + 运行期非空)", () => {
    const all: readonly ArtifactType[] = [
      "project_idea",
      "trend_analysis",
      "market_analysis",
      "competitor_analysis",
      "audience_research",
      "research_note",
      "content_contract",
      "thesis_tree",
      "evidence_map",
      "audience_profile",
      "differentiation",
      "content_outline",
      "master_script",
      "output_script",
      "golden_quotes",
      "script_review",
      "production_plan",
      "shot_list",
      "timeline",
      "subtitle_plan",
      "export_config",
      "publish_package",
      "platform_copy",
      "cover_brief",
      "review_report",
      "comparison_report",
      "optimization_plan",
    ];
    for (const t of all) {
      expect(ARTIFACT_TYPE_LABELS[t]).toBeTruthy();
      // 中文词条,不能等于内部码本身。
      expect(humanizeArtifactType(t)).not.toBe(t);
    }
  });

  it("未知/缺省类型码 → 诚实回落「产物」而非裸吐码", () => {
    expect(humanizeArtifactType("")).toBe("产物");
    expect(humanizeArtifactType(undefined)).toBe("产物");
    expect(humanizeArtifactType("some_future_type")).toBe("产物");
  });
});
