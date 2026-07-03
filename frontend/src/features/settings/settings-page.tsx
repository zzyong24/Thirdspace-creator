/**
 * Settings page (Task 25 / page-specs §17).
 *
 * The `/settings` global resource-center landing page. Composes:
 *
 *   SettingsPage
 *   └── SettingsRegion               ([T-054 组 A] 整页:左竖排页签导航 +
 *       ├── settings-tabs             右内容区自然流;8 页签 = 账户/偏好/
 *       └── settings-panels           外观/模型配置/存储/定位/校准/任务)
 *
 * Layout invariants (page-specs §17, D-003, D-005):
 *  - The route is a global resource-center route. The Header region
 *    is in `global` mode with the page title "设置" and description
 *    "账号、偏好与系统" (configured by `(creator)/shell-router.tsx`).
 *  - The shared Sidebar uses the approved `assistant` contextual-card
 *    variant (D-003). The page itself does NOT render the global
 *    Sidebar — that lives in `(creator)/layout.tsx`.
 *  - The vertical tab nav renders 8 tabs in the approved order
 *    (账户/偏好/外观/模型配置/存储/定位/校准/任务,[T-063a] 收敛后)。
 *  - The content area is natural flow (文档类页签整页滚,design-standard
 *    §1);每个页签的卡纵向排列。
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

import { SettingsRegion } from "./settings-interactive-region";

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
   * [T-063a] 初始页签(route 从 ?tab= 解析;/positioning /calibration /automations
   * /accounts 301 落到对应页签)。非法/缺省落「账户」。
   */
  readonly initialTab?: string;
  /**
   * [T-063a] 三个降级页签 + 账户页签的内嵌核心区(route server 装配后传入;
   * 删壳不删肉——原 feature 组件原样复用)。
   */
  readonly positioningPanel?: React.ReactNode;
  readonly calibrationPanel?: React.ReactNode;
  readonly automationsPanel?: React.ReactNode;
  readonly accountsPanel?: React.ReactNode;
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

export interface PreferencesState {
  readonly defaultHome: string;
  readonly defaultCreationMode: "guided" | "flexible" | "freeform";
  readonly defaultVisibility: "private" | "unlisted" | "public";
  readonly autosaveEnabled: boolean;
  readonly analyticsEnabled: boolean;
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
    | "asset.classify";
  /** Free-form provider name (the dispatch switch; "minimax"/"siliconflow" today, extensible). */
  readonly provider: string;
  /** Free-form model id (e.g. image-01 / video-01 / FunAudioLLM/SenseVoiceSmall). */
  readonly modelName: string;
  /** Custom baseUrl (e.g. https://api.minimaxi.com/v1); "" = provider default. */
  readonly baseUrl: string;
  /** Masked: a secret is configured (raw value never sent to the client). */
  readonly hasSecret: boolean;
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
  initialTab,
  positioningPanel,
  calibrationPanel,
  automationsPanel,
  accountsPanel,
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
  // [T-054 组 A] 设置为整页布局(design-standard §4 第一条):左侧竖排页签导航 +
  // 右侧内容区自然流(SettingsRegion,随 shell 的 PageScrollArea 整页滚)。页头
  // 走今日台 embedded 范式:global 模式的 shell TopHeader 是透明 overlay(标题
  // sr-only、/settings 无 actions),可见的「设置 + 账号、偏好与系统」由页内渲
  // 且只渲一次(§1 绝不双头)。Dialog 壳已退役。
  return (
    <main
      data-app="creatoros"
      data-page="settings"
      data-settings-id="settings-root"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-0.5">
        <h1
          data-slot="settings-page-heading"
          className="font-heading text-xl font-semibold text-foreground"
        >
          设置
        </h1>
        <p className="text-sm text-muted-foreground">账号、偏好与系统</p>
      </header>
      <SettingsRegion
        viewModel={vm}
        initialTab={initialTab}
        positioningPanel={positioningPanel}
        calibrationPanel={calibrationPanel}
        automationsPanel={automationsPanel}
        accountsPanel={accountsPanel}
      />
    </main>
  );
}
