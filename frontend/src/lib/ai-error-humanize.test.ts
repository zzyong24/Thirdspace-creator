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
  it("模型尚未配置 → 归入可恢复的 AI 设置状态，不透出凭据术语", () => {
    for (const raw of [
      "LlmCredentialError: 无可用 LLM 凭据",
      "MODEL_NOT_CONFIGURED",
      "尚未配置 API Key",
    ]) {
      expect(humanizeAiErrorMessage(raw)).toMatchObject({
        code: "model_not_configured",
        message: "还没有可用的 AI 模型。完成设置后，回到这里即可继续。",
        suggestSwitchModel: true,
      });
    }
  });

  it("定位缺失 → 归入定位恢复状态，不误导用户修改模型", () => {
    for (const raw of [
      "POSITIONING_MISSING",
      "当前账号缺少可用定位，请先完成定位后重试",
      "当前账号还没有可用定位。先生成并保存一版定位，再回来继续。",
    ]) {
      expect(humanizeAiErrorMessage(raw)).toMatchObject({
        code: "positioning_required",
        message: "当前账号还没有可用定位。先生成并保存一版定位，再回来继续。",
        suggestSwitchModel: false,
        suggestOpenPositioning: true,
      });
    }
  });

  it("DeepSeek model not found → 稳定模型分类 + 设置指引", () => {
    const human = humanizeAiErrorMessage(
      "AI_APICallError: 404 model not found: deepseek-v4-flash",
    );
    expect(human).not.toBeNull();
    expect(human!.code).toBe("model_not_found");
    expect(human!.message).toContain("模型配置");
    expect(human!.message).toContain("设置");
    expect(human!.suggestSwitchModel).toBe(true);
  });

  it("当前模型不支持图片输入 → 清晰提示切换视觉模型", () => {
    for (const raw of [
      "This model does not support image input.",
      "unsupported vision content for current model",
    ]) {
      expect(humanizeAiErrorMessage(raw)).toMatchObject({
        code: "image_input_unsupported",
        message: "当前模型不支持识别图片，请切换支持图片的模型，或改用文字描述。",
        suggestSwitchModel: true,
      });
    }
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
    expect(human?.message).toContain("AI 设置");
    expect(human?.suggestSwitchModel).toBe(true);
  });

  it("模型方 API Key 鉴权失败有独立分类", () => {
    for (const raw of [
      "AI_APICallError: invalid_api_key",
      "authentication_error: Incorrect API key provided",
    ]) {
      const human = humanizeAiErrorMessage(raw);
      expect(human?.code).toBe("provider_auth");
      expect(human?.message).toContain("AI 设置");
      expect(human?.message).not.toContain("API Key");
      expect(human?.suggestSwitchModel).toBe(true);
    }
  });

  it("实录主案例:MiniMax 输入敏感拦截(new_sensitive / 1026)→ 人话 + 建议换模型", () => {
    const raw =
      "Failed after 3 attempts. AI_APICallError: input new_sensitive (1026)";
    const human = humanizeAiErrorMessage(raw);
    expect(human).not.toBeNull();
    expect(human!.message).toContain("暂时无法生成");
    expect(human!.message).toContain("更换模型");
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
    expect(human!.message).toContain("频繁");
    expect(human!.suggestSwitchModel).toBe(false);
  });

  it("余额/配额不足(1008 / insufficient balance)→ 人话 + 建议换模型", () => {
    const human = humanizeAiErrorMessage("insufficient balance (1008)");
    expect(human).not.toBeNull();
    expect(human!.suggestSwitchModel).toBe(true);
    expect(human!.suggestOpenCredits).not.toBe(true);
  });

  it("受管 AI 额度不足 → 引导充值，不误导用户修改模型", () => {
    const human = humanizeAiErrorMessage(
      "ManagedAiCreditExhaustedError: AI 额度不足，请充值后再试。",
    );
    expect(human).toMatchObject({
      code: "quota_exhausted",
      message: "AI 额度不足，请充值后再试。",
      suggestSwitchModel: false,
      suggestOpenCredits: true,
    });
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
    expect(describeUserError(err)).toContain("暂时无法生成");
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
    // 模型未配置属于已知可恢复状态，应先翻译，不把 LLM/凭据等内部术语透出。
    expect(describeUserError(new Error("无可用 LLM 凭据"))).toBe(
      "还没有可用的 AI 模型。完成设置后，回到这里即可继续。",
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
    expect(humanizeArtifactType("cover_copy")).toBe("封面文案");
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
      "cover_copy",
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
