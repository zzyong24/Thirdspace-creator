/**
 * Settings page (Task 25 / page-specs §17).
 *
 * The `/settings` global resource-center landing page. Composes, in
 * the spec order:
 *
 *   SettingsPage
 *   ├── SettingsTabs                  (5 tabs in approved order)
 *   └── SettingsGrid
 *       ├── MainSettings              (AccountInformationCard →
 *       │                               PreferenceSettingsCard →
 *       │                               SystemSettingsCard)
 *       └── SettingsRail              (StorageUsageCard →
 *                                       ModelConfigurationCard)
 *
 * Layout invariants (page-specs §17, D-003, D-005):
 *  - The route is a global resource-center route. The Header region
 *    is in `global` mode with the page title "设置" and description
 *    "账号、偏好与系统" (configured by `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `assistant` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - The SettingsTabs strip renders 5 tabs in the approved order
 *    (account / preferences / appearance / integrations / storage).
 *  - The SettingsGrid is a two-column grid (left wide / right narrow).
 *  - The MainSettings column stacks Account → Preference → System
 *    vertically (page-specs §17 "账户信息、偏好设置、系统设置
 *    纵向排列").
 *  - The SettingsRail column stacks Storage → Model vertically
 *    (page-specs §17 "存储空间、模型配置位于右栏").
 *  - Form rows follow the "label + control" compact pattern.
 *  - No team / permission / collaboration settings are added
 *    (D-001 + page-specs §17 "禁止改变": "不新增团队或权限设置").
 *  - No subscription detail page is added (page-specs §17
 *    "禁止改变": "不增加订阅管理详情页").
 *  - ModelConfigurationCard stays on this page — NOT a separate route
 *    (page-specs §17 "禁止改变": "不把模型配置移到独立页面").
 *  - Controls have fixture-only local state. No server persistence.
 *  - No new dependencies, no fixture mutation, no Date.now /
 *    Math.random / network access.
 *
 * The page is a Server Component. It does not own a Sidebar or a
 * TopHeader — those live in `(creator)/layout.tsx` and are mounted
 * once for the whole route group.
 */

import * as React from "react";

import { buildSettingsViewModel } from "@/fixtures/selectors";

import { SettingsDialog } from "./settings-interactive-region";
import type { SkillItem } from "./skills-data";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SettingsPageProps {
  /**
   * Override hook for tests; defaults to the canonical dataset.
   * The page does not consume network or runtime data — it pulls
   * everything from the fixed fixtures (D-010) so SSR output is
   * deterministic.
   */
  readonly viewModel?: SettingsViewModel;
  /**
   * Real logged-in identity (Module 00, Task 12). When supplied (by the
   * `(creator)/settings` route, which resolves the session through the
   * identity service — the `userResource` shape `settings.get` will
   * serve in Wave 1), the account card's display name / email / timezone
   * / locale come from the REAL user instead of the fixture default. The
   * preference / system / storage / model rows stay fixture-derived
   * (their persistence is the Settings module, Wave 1). Omitted in unit
   * tests, which inject the full `viewModel` directly.
   */
  readonly identity?: SettingsIdentity;
  /**
   * Real DB-backed model config for the "default" capability (read by the
   * `(creator)/settings` route via `settings.models.list`). When supplied, the
   * model card reflects the stored provider / model / baseUrl / format /
   * hasSecret instead of the fixture default. Omitted in unit tests.
   */
  readonly model?: ModelState;
  /**
   * Real DB-backed storage config + usage (read by the `(creator)/settings`
   * route via `settings.storage.get`). When supplied, the StorageUsageCard shows
   * the real media root / backend / used-vs-capacity / per-type breakdown instead
   * of the fixture default. Omitted in unit tests.
   */
  readonly storage?: StorageState;
  /**
   * Real DB-backed multimodal model config for the `image.generate` /
   * `video.generate` capabilities (read by the `(creator)/settings` route via the
   * SAME `settings.models.list` call as `model`). When supplied, the two
   * multimodal cards reflect the stored provider / model / baseUrl / hasSecret
   * instead of the (unconfigured) fixture default. Omitted in unit tests.
   */
  readonly multimodalModels?: MultimodalModelsState;
  /**
   * Real抖音 login status (read by the `(creator)/settings` route via
   * `ingestion.douyin.status` — a headless cookie probe, no popup). When supplied,
   * the AccountBindingCard's badge reflects the real connected/expired state instead
   * of the fixture default (未连接). Omitted in unit tests, which inject the full
   * `viewModel` directly.
   */
  readonly douyinAccount?: DouyinAccountState;
  /**
   * [T-051 2e] Real DB-backed 偏好(route 经 settings.preferences.get 读)。
   * 此前 patch 写库但无读回,设置页永远渲染 fixture 默认(写真读假)。
   * When supplied, 偏好卡初值 = 用户真值。Omitted in unit tests.
   */
  readonly preferences?: PreferencesState;
  /**
   * [T-077a] 技能清单(route 经 ai-worker `listTemplates()` + `settings.prompts.list`
   * 投影成可序列化条目)。设置弹窗「技能」页签据此渲列表/详情;缺省(单测)→ 诚实空态。
   */
  readonly skills?: readonly SkillItem[];
  /**
   * [T-167] 桌面激活状态(route server 侧经 `getActivationService().getStatus()` 本地读,
   * **不打网络**)。「账户」页签的激活卡据此显四态徽章 + 授权类型 / 到期 / 机器码 / 最后在线校验。
   * web / 未装配 / 读失败 → undefined:激活卡显「激活为桌面端功能」诚实空态,绝不假装已激活。
   */
  readonly activation?: ActivationState;
}

/**
 * [T-167] 激活状态视图段。字段直接来自 `activation-service.getStatus()`(`ActivationStatusView`);
 * 全部可序列化(server → client props)。缺激活态 → status="inactive"、其余 null(诚实四态)。
 */
export interface ActivationState {
  readonly status: "inactive" | "active" | "grace" | "expired";
  readonly machineId: string | null;
  readonly licenseMode: string | null;
  /** ISO;null = 永久激活。 */
  readonly expiresAt: string | null;
  readonly activatedAt: string | null;
  readonly lastOnlineCheckAt: string | null;
  // ── [T-372 L3] 安全门展示副本(Rust 壳 syncFromShell 同步;老库缺省 → 诚实显「未知」) ──
  /** 防回拨 last-seen(ISO)。 */
  readonly lastSeenAt?: string | null;
  /** 码型宽限秒数(内测 86400 / 买断 2592000)。 */
  readonly graceSeconds?: number | null;
  /** 签名撤销标记:买断 revoked → 更新入口旁提示「停更新,不锁功能」。 */
  readonly revoked?: boolean;
}

/** The identity fields the Settings account card binds to (`userResource`). */
export interface SettingsIdentity {
  readonly displayName: string;
  readonly email: string;
  readonly timezone: string;
  readonly locale: string;
}

export interface SettingsViewModel {
  readonly account: AccountInformation;
  readonly preferences: PreferencesState;
  readonly system: SystemState;
  readonly storage: StorageState;
  readonly model: ModelState;
  /**
   * Multimodal (image / video) generation model config — the two extra
   * capabilities `image.generate` / `video.generate` (SPEC 2026-07-01 §2.1, M3).
   * Read from the SAME `settings.models.list` op as the text `model` above
   * (`capability` is a free-form string — zero contract change). `resolveMultimodalSpec`
   * (server/ai/multimodal/resolve.ts) reads these rows so the recording page's
   * AI-generate can use the user's own provider/key; unconfigured = honestly disabled.
   */
  readonly multimodalModels: MultimodalModelsState;
  /**
   * 抖音账号绑定状态(T-032a)。设置页「账号绑定」卡据此显「已连接/未连接」徽标 + 扫码按钮。
   * `loggedIn=false` 同时覆盖「未连接」与「登录态已过期」两态(.auth/ profile 目录存在≠有效登录,
   * cookie 失效即 false → 引导重新扫码)。初始值由 route SSR 读 `ingestion.douyin.status` 得(读失败
   * 退回未连接);点击「连接抖音(扫码)」走 `client.loginDouyin({})` 后客户端重拉 status 刷新徽标。
   */
  readonly douyinAccount: DouyinAccountState;
}

/** 抖音账号绑定状态段(T-032a)。 */
export interface DouyinAccountState {
  /** 被动探针 `ingestion.douyin.status` 的结果:是否有有效登录态(sessionid cookie 存在)。 */
  readonly loggedIn: boolean;
  /**
   * [T-144] 是否已有真实采集源(external_source)。登录态 ≠ 能采集:缺采集源时显「已扫码,
   * 采集源未就绪」而非虚假「可采集」。SSR 兜底缺省 false(与 loggedIn 同,诚实)。
   */
  readonly sourceReady?: boolean;
}

export interface AccountInformation {
  readonly displayName: string;
  readonly email: string;
  readonly initials: string;
  readonly planLabel: string;
  readonly timezone: string;
  /**
   * BCP-47 locale tag from the user's identity (`userResource.locale`).
   * Rendered as a real identity chip (Module 00, Task 12); the 已验证
   * badge + plan chip stay intentionally inert (decorative).
   */
  readonly locale: string;
}

// [T-247 假设置清算] 偏好投影只保留有真实消费方的两项(defaultCreationMode →
// 新建项目预选;autosaveEnabled → 编辑器失焦自动保存)。defaultHome / defaultVisibility /
// analyticsEnabled / fileNamingRule 契约字段保留兼容,但 UI 不再渲染、投影不再携带。
export interface PreferencesState {
  readonly defaultCreationMode: "guided" | "flexible" | "freeform";
  readonly autosaveEnabled: boolean;
}

export interface SystemState {
  readonly theme: "system" | "light" | "dark";
  readonly density: "comfortable" | "compact";
  readonly notifications: boolean;
  readonly locale: string;
}

export interface StorageState {
  /** Configured backend ('local' = local disk, 's3' = bucket). */
  readonly backend: "local" | "s3";
  /** Resolved absolute media root (editable; saved via settings.storage.put). */
  readonly rootPath: string;
  /** Real bytes consumed by the user's asset files. */
  readonly usedBytes: number;
  /** Capacity of the disk holding rootPath (0 = unknown). */
  readonly totalBytes: number;
  readonly breakdown: ReadonlyArray<StorageBreakdownRow>;
}

export interface StorageBreakdownRow {
  /** Contract asset_type (e.g. "video" | "image" | …). */
  readonly assetType: string;
  /** Localized display label. */
  readonly label: string;
  /** Real bytes for this asset type. */
  readonly bytes: number;
  readonly tone: "neutral" | "brand" | "success" | "warning";
}

export interface ModelState {
  /** The configured capability — the card pins to the global "default". */
  readonly capability: string;
  /** Free-form provider name (bind any vendor). */
  readonly provider: string;
  /** Free-form model id (e.g. claude-opus-4-8 / MiniMax-M3). */
  readonly modelName: string;
  /** Custom baseUrl (relay / MiniMax); "" = official default. */
  readonly baseUrl: string;
  /** Wire/auth format. */
  readonly apiFormat: "anthropic" | "openai_chat";
  /** Masked: a secret is configured (raw value never sent to the client). */
  readonly hasSecret: boolean;
  readonly temperature: number;
}

// ---------------------------------------------------------------------------
// Multimodal (image / video) model config — SPEC 2026-07-01 §2.1 / M3
// ---------------------------------------------------------------------------
//
// A multimodal capability's binding. Unlike the text `ModelState`, there is NO
// `apiFormat` / `temperature`: `resolveMultimodalSpec` (server/ai/multimodal/
// resolve.ts) dispatches purely on `provider` (the vendor switch) and reads only
// provider / baseUrl / model / secret. Keeping the form to just those four fields
// mirrors exactly what the resolver consumes — no dead controls.
export interface MultimodalModelState {
  /** The bound capability ("image.generate" | "video.generate" | "transcribe.audio"). */
  readonly capability:
    | "image.generate"
    | "video.generate"
    | "transcribe.audio"
    | "asset.classify"
    // [T-093] 知识库语义搜索 embedding(OpenAI 兼容 embedding 端点;未配诚实降级关键词)。
    | "knowledge.search.embed"
    // [T-086] 编导文案审核 L2 语义审(豆包/火山方舟预设;未配回退默认并标注非专用)。
    | "script.review"
    // [T-084a] 联网搜索(素材搜集前置真检索;未配 → 素材来自模型记忆需核实)。
    | "web.search"
    // [T-239b] 备用对话模型(主模型可重试错误耗尽时接管一次;未配 → 现状报错)。
    | "chat.fallback";
  /** Free-form provider name (the dispatch switch; "minimax"/"siliconflow" today, extensible). */
  readonly provider: string;
  /** Free-form model id (e.g. image-01 / video-01 / FunAudioLLM/SenseVoiceSmall). */
  readonly modelName: string;
  /** Custom baseUrl (e.g. https://api.minimaxi.com/v1); "" = provider default. */
  readonly baseUrl: string;
  /** Masked: a secret is configured (raw value never sent to the client). */
  readonly hasSecret: boolean;
  /**
   * [T-239b] 接口格式 —— 仅 chat.fallback 卡消费(备用**对话**模型走文本 LLM 解析链,
   * resolveModelSpec 按 apiFormat 分派 anthropic / OpenAI 兼容适配器;其它多模态卡的
   * 解析器按 provider 分派、忽略此字段,故可选)。
   */
  readonly apiFormat?: "anthropic" | "openai_chat";
}

export interface MultimodalModelsState {
  /** 文生图 — capability "image.generate". */
  readonly image: MultimodalModelState;
  /** 文生视频 — capability "video.generate". */
  readonly video: MultimodalModelState;
  /**
   * 逐字稿 ASR — capability "transcribe.audio" (SPEC 2026-07-01 §5.1, T-030-D1). Read from the
   * SAME `settings.models.list` op (capability is a free-form string — zero contract change).
   * `resolveTranscribeSpec` (server/ai/multimodal/resolve.ts) reads this row so the transcribe
   * pipeline (D2) can use the user's own OpenAI-compatible ASR provider/key; unconfigured =
   * honestly disabled.
   */
  readonly audio: MultimodalModelState;
  /** [T-055h] 素材 AI 归类(视觉理解)— capability "asset.classify"。 */
  readonly vision: MultimodalModelState;
  /**
   * [T-093] 知识库语义搜索 embedding — capability "knowledge.search.embed"。同一
   * `settings.models.list` op 读回(capability 自由字符串,零契约改动)。未配置 =
   * 知识库 AI 搜索诚实降级为纯关键词(结果区渲「AI 语义搜索未启用」提示条)。
   */
  readonly embed: MultimodalModelState;
  /**
   * [T-086] 文案审核模型 — capability "script.review"。编导文案发布前合规审核(L2
   * 语义审)专用。同一 `settings.models.list` op 读回(capability 自由字符串,零契约
   * 改动)。豆包/火山方舟仅为预设,用户可整卡改成任何 OpenAI 兼容端点;未配 → 用默认
   * 模型审核,报告标注「非专用审核模型」(诚实数据)。
   */
  readonly review: MultimodalModelState;
  /**
   * [T-084a] 联网搜索 — capability "web.search"。素材搜集(material.gather)前置真联网检索
   * 专用。同一 `settings.models.list` op 读回(capability 自由字符串,零契约改动)。博查/
   * Tavily/SerpApi 首发,用户可自定义 provider;未配 → 素材来自模型训练记忆(卡片黄条 +
   * 需核实徽标 + honestyBlock 声明非实时检索,诚实降级不假搜)。
   */
  readonly search: MultimodalModelState;
  /**
   * [T-239b] 备用对话模型 — capability "chat.fallback"。主对话模型「流开始前」可重试错误
   * (5xx/429/网络断/overloaded)重试耗尽时,由它接管一次(错误恢复层 S1)。同一
   * `settings.models.put` op(capability 自由字符串,零契约改动);**只认专配行** —— 未配 =
   * 现状报错(诚实,不静默换模型)。模型用户可配的铁律:绝不写死 fallback 厂商。
   */
  readonly fallback: MultimodalModelState;
}

// ---------------------------------------------------------------------------
// Identity overlay (Module 00, Task 12)
// ---------------------------------------------------------------------------

/**
 * Overlay the real logged-in identity onto the account card of a base
 * view model. Pure — no `Date.now` / `Math.random` / network. Only the
 * account display fields are replaced; everything else is untouched.
 */
function applyIdentity(
  base: SettingsViewModel,
  identity: SettingsIdentity,
): SettingsViewModel {
  return {
    ...base,
    account: {
      ...base.account,
      displayName: identity.displayName,
      email: identity.email,
      timezone: identity.timezone,
      locale: identity.locale,
      initials: computeAccountInitials(identity.displayName),
    },
    system: {
      ...base.system,
      locale: identity.locale,
    },
  };
}

function computeAccountInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function SettingsPage({
  viewModel,
  identity,
  model,
  storage,
  multimodalModels,
  douyinAccount,
  preferences,
  skills,
  activation,
}: SettingsPageProps = {}) {
  const base = viewModel ?? buildSettingsViewModel();
  const withIdentity = identity ? applyIdentity(base, identity) : base;
  const withPreferences = preferences
    ? { ...withIdentity, preferences }
    : withIdentity;
  const withModel = model ? { ...withPreferences, model } : withPreferences;
  const withStorage = storage ? { ...withModel, storage } : withModel;
  const withMultimodal = multimodalModels
    ? { ...withStorage, multimodalModels }
    : withStorage;
  const vm = douyinAccount
    ? { ...withMultimodal, douyinAccount }
    : withMultimodal;
  // 设置改弹窗式:页面本身只留一个 marker (供 shell-router 路由 + 测试定位),
  // 真正的内容是浮在其上的居中大弹窗 (SettingsDialog,Radix Portal 到 body)。
  // 弹窗默认打开,关闭 → router.back() 回上一页。背景仍是 (creator) 的 AppShell
  // (sidebar/header 真实数据读取不变)。
  return (
    <main
      data-app="creatoros"
      data-page="settings"
      data-settings-id="settings-root"
      className="flex flex-col gap-section-gap"
    >
      <SettingsDialog viewModel={vm} skills={skills} activation={activation} />
    </main>
  );
}
