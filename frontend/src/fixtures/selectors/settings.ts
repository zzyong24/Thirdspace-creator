/**
 * Settings selector.
 *
 * Maps the canonical dataset to the `SettingsViewModel` consumed by the
 * Settings page. Pure and deterministic — no `Date.now`, `Math.random`
 * or network access. The page imports `buildSettingsViewModel` from
 * `@/fixtures/selectors` and never dereferences `canonicalDataset` for
 * data shaping.
 */

import { canonicalDataset } from "../canonical";
import type {
  AccountInformation,
  SettingsViewModel,
  StorageState,
} from "@/features/settings/settings-page";

// ---------------------------------------------------------------------------
// View model — derived from canonical dataset, with deterministic
// fallbacks so the page is never empty.
// ---------------------------------------------------------------------------

export function buildSettingsViewModel(): SettingsViewModel {
  const user = canonicalDataset.user;
  const preferences =
    canonicalDataset.userPreferences[0] ??
    {
      id: "pref-fallback",
      userId: user.id,
      defaultHome: "dashboard",
      defaultCreationMode: "guided" as const,
      defaultVisibility: "private" as const,
      autosaveEnabled: true,
      fileNamingRule: "{project}-{stage}-{date}",
      analyticsEnabled: false, // 默认关(PROTECTION.md §4 遥测零收集,与后端默认一致)
    };

  return {
    account: buildAccount(user),
    preferences: {
      defaultHome: preferences.defaultHome,
      defaultCreationMode: preferences.defaultCreationMode,
      defaultVisibility: preferences.defaultVisibility,
      autosaveEnabled: preferences.autosaveEnabled,
      analyticsEnabled: preferences.analyticsEnabled,
    },
    system: {
      theme: "system",
      density: "comfortable",
      notifications: true,
      locale: user.locale,
    },
    storage: buildStorage(),
    model: {
      capability: "default",
      provider: "anthropic",
      modelName: "claude-opus-4-8",
      baseUrl: "",
      apiFormat: "anthropic",
      hasSecret: false,
      temperature: 0.6,
    },
    // Multimodal (image / video) generation model config (SPEC 2026-07-01 M3).
    // Unconfigured by default — the recording page's AI-generate stays honestly
    // disabled until the user binds a provider/model/key here. minimax is the
    // suggested provider today (M1 shipped a minimax adapter) but the field is
    // free-form (extensible to other vendors).
    multimodalModels: {
      image: {
        capability: "image.generate",
        provider: "",
        modelName: "",
        baseUrl: "",
        hasSecret: false,
      },
      video: {
        capability: "video.generate",
        provider: "",
        modelName: "",
        baseUrl: "",
        hasSecret: false,
      },
      // 逐字稿 ASR (transcribe.audio, T-030-D1). Unconfigured by default — the
      // transcribe pipeline (D2) stays honestly disabled until the user binds an
      // OpenAI-compatible ASR provider/model/key here (SiliconFlow suggested).
      audio: {
        capability: "transcribe.audio",
        provider: "",
        modelName: "",
        baseUrl: "",
        hasSecret: false,
      },
    vision: {
      capability: "asset.classify" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    // [T-093] 知识库语义搜索 embedding。Unconfigured by default — AI 搜索诚实降级
    // 纯关键词,直到用户在此绑 OpenAI 兼容 embedding provider/model/key。
    embed: {
      capability: "knowledge.search.embed" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    // [T-086] 文案审核模型。缺省未配 —— 编导文案审用默认模型并标注非专用,直到用户在此
    // 绑豆包/火山方舟(或任意 OpenAI 兼容端点)provider/model/key。
    review: {
      capability: "script.review" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    // [T-084a] 联网搜索。缺省未配 —— 素材搜集来自模型记忆(卡片黄条+需核实徽标),直到
    // 用户在此绑博查/Tavily/SerpApi(或任意搜索 provider)provider/key。
    search: {
      capability: "web.search" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    // [T-239b] 备用对话模型。缺省未配 —— 主模型可重试错误耗尽后现状报错(诚实,不静默换模型),
    // 直到用户在此绑一个与主模型不同的 provider/model/key。
    fallback: {
      capability: "chat.fallback" as const,
      provider: "",
      modelName: "",
      baseUrl: "",
      hasSecret: false as const,
    },
    },
    // 抖音账号绑定状态 (T-032a). Default unconnected — the real status is read by
    // the (creator)/settings route via `ingestion.douyin.status` and overlaid onto
    // this VM. The AccountBindingCard then shows「未连接」+「连接抖音(扫码)」until
    // the user scans and a valid sessionid cookie exists.
    douyinAccount: {
      loggedIn: false,
    },
  };
}

function buildAccount(user: {
  displayName: string;
  email: string;
  timezone: string;
  locale: string;
}): AccountInformation {
  const initials = computeInitials(user.displayName);
  return {
    displayName: user.displayName,
    email: user.email,
    initials,
    // planLabel + 已验证 badge stay intentionally inert (decorative) —
    // no billing/verification entity exists in Wave 0 (Module 00, Task 12).
    planLabel: "个人版",
    timezone: user.timezone,
    locale: user.locale,
  };
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1);
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

// Deterministic fixture fallback (item B — real shape: bytes, not GB). The
// `(creator)/settings` route overlays the real `settings.storage.get` values;
// this fixture only keeps SSR non-empty before the read resolves.
function buildStorage(): StorageState {
  return {
    backend: "local",
    rootPath: "~/CreatorOS/media",
    usedBytes: 18_000_000_000,
    totalBytes: 64_000_000_000,
    breakdown: [
      { assetType: "video", label: "视频素材", bytes: 9_200_000_000, tone: "brand" },
      { assetType: "image", label: "图片素材", bytes: 4_400_000_000, tone: "success" },
      { assetType: "audio", label: "音频素材", bytes: 2_100_000_000, tone: "warning" },
      { assetType: "document", label: "文档与导出", bytes: 2_300_000_000, tone: "neutral" },
    ],
  };
}
