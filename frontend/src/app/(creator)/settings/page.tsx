/**
 * Settings route entrypoint.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader)
 * and the global Header is configured for `/settings` with title
 * "设置", description "账号、偏好与系统" and the approved `assistant`
 * contextual-card variant in `shell-router.tsx` (D-003, page-specs §17).
 * The page itself is a Server Component (page-specs §17) and just
 * provides the page slot.
 *
 * Step 6 (Settings module): the account card now reads the REAL
 * `settings.get` op through the server-bound contract client (in-process
 * over the seeded pglite store), exercising the module's transport on the
 * server read path. The model / storage rows read the REAL
 * `settings.models.list` / `settings.storage.get` ops; their mutations
 * persist through the island ops and a `router.refresh()` re-runs this read.
 *
 * [FE-H02] Honesty on read failure: when a read is unavailable or the value
 * is unconfigured, this route passes an EXPLICIT honest empty state
 * (UNCONFIGURED_MODEL / EMPTY_STORAGE) — NEVER the fixture's fabricated model
 * (anthropic / claude-opus-4-8) or disk usage (18GB/64GB). The fixture is a
 * test-only SSR-non-empty fallback; production must not present it as real.
 * The account card falls back to the session identity DTO when its op read is
 * unavailable (race / direct render).
 */
import {
  SettingsPage,
  type PreferencesState,
  type ModelState,
  type ModelAuthorityState,
  type MultimodalModelState,
  type MultimodalModelsState,
  type StorageState,
  type ActivationState,
  type ChannelLinksState,
} from "@/features/settings/settings-page";
import { readChannelRuntime } from "@/server/activation/channel-runtime.server";
import { readChannelModelAuthority } from "@/server/activation/client-config.server";
import {
  buildSkillItems,
  type SkillItem,
} from "@/features/settings/skills-data";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
// [T-167] 激活状态面板:server 侧本地读 getActivationService().getStatus()(**不打网络**)。
// 仅桌面态(isDesktopRuntime)有意义;web/未装配 → 传 undefined → 卡片显「桌面端专属」空态。
import { getActivationService } from "@/server/persistence-client";
import { isDesktopRuntime } from "@/server/activation";

// item B — localized labels + tones for the StorageUsageCard breakdown rows.
const STORAGE_TYPE_LABELS: Record<
  string,
  { label: string; tone: StorageState["breakdown"][number]["tone"] }
> = {
  video: { label: "视频素材", tone: "brand" },
  image: { label: "图片素材", tone: "success" },
  audio: { label: "音频素材", tone: "warning" },
  document: { label: "文档与导出", tone: "neutral" },
  subtitle: { label: "字幕文件", tone: "neutral" },
};

// [FE-H02] 生产读取失败 / 未配置的诚实兜底。绝不回退到 fixture 的伪造模型 / 占用
// (fixture 仅供单测与 SSR 首帧,不能当真实数据喂给用户)。模型未配置 = 空供应商/模型
// (卡片渲染成「未配置」表单);存储读取失败 = 诚实置 0(数据缺失置 0 铁律)。
const UNCONFIGURED_MODEL: ModelState = {
  capability: "default",
  provider: "",
  modelName: "",
  baseUrl: "",
  apiFormat: "anthropic",
  hasSecret: false,
  temperature: 0.6,
};
const EMPTY_STORAGE: StorageState = {
  backend: "local",
  rootPath: "",
  usedBytes: 0,
  totalBytes: 0,
  breakdown: [],
};

export default async function SettingsRoutePage() {
  // Resolve the request's session → ctx (the (creator) layout already guarded
  // it). Read the account card from the real `settings.get` op under that ctx
  // (user-scoped). Fall back to the session user DTO, then to the fixture, so
  // the page never renders empty.
  const session = await resolveSession();

  let identity:
    | {
        displayName: string;
        email: string;
        timezone: string;
        locale: string;
      }
    | undefined;

  if (session) {
    try {
      const account = await createServerClient(session.ctx).getSettings({
        params: undefined,
        query: undefined,
        body: undefined,
      });
      identity = {
        displayName: account.displayName,
        email: account.email,
        timezone: account.timezone,
        locale: account.locale,
      };
    } catch {
      // `settings.get` unavailable (e.g. transport race) → fall back to the
      // session user DTO the layout already resolved.
      identity = {
        displayName: session.user.displayName,
        email: session.user.email,
        timezone: session.user.timezone,
        locale: session.user.locale,
      };
    }
  }

  // Read the real DB-backed model configs (settings.models.list) so the cards
  // reflect the stored provider / model / baseUrl / format / hasSecret. A single
  // list call feeds BOTH the text "default" card AND the two multimodal
  // (image.generate / video.generate) cards.
  // [FE-H02] 读取失败 / 未配置默认模型 → 诚实的「未配置」态(UNCONFIGURED_MODEL),绝不
  // 回退 fixture 的伪造模型(原来 undefined 会让页面渲染 fixture 的 anthropic/claude-opus-4-8,
  // 把不存在的模型当真)。
  let model: ModelState = UNCONFIGURED_MODEL;
  let multimodalModels: MultimodalModelsState | undefined;
  if (session) {
    try {
      const models = await createServerClient(session.ctx).listModels({
        params: undefined,
        query: undefined,
        body: undefined,
      });
      const row =
        models.find((m) => m.capability === "default") ??
        models.find((m) => m.isDefault);
      if (row) {
        const temp = (row.settings as { temperature?: unknown }).temperature;
        model = {
          capability: row.capability,
          provider: row.provider,
          modelName: row.modelName,
          baseUrl: row.baseUrl ?? "",
          apiFormat: row.apiFormat,
          hasSecret: row.hasSecret,
          temperature: typeof temp === "number" ? temp : 0.6,
        };
      }
      // 没有 default 行 → model 保持 UNCONFIGURED_MODEL(诚实「未配置」,不假装绑了模型)。

      // Project the two multimodal capability rows (if configured). No apiFormat/
      // temperature — resolveMultimodalSpec dispatches on provider alone. An absent
      // row yields an unconfigured card (empty provider/model, hasSecret=false),
      // which the card renders as the honest "未配置" state.
      const multimodalRow = (
        capability: MultimodalModelState["capability"],
      ): MultimodalModelState => {
        const found = models.find((m) => m.capability === capability);
        return {
          capability,
          provider: found?.provider ?? "",
          modelName: found?.modelName ?? "",
          baseUrl: found?.baseUrl ?? "",
          hasSecret: found?.hasSecret ?? false,
          // [T-239b/T-471] 备用对话模型卡消费三种文本协议;其它卡忽略。
          apiFormat: found?.apiFormat,
        };
      };
      multimodalModels = {
        image: multimodalRow("image.generate"),
        video: multimodalRow("video.generate"),
        audio: multimodalRow("transcribe.audio"),
        vision: multimodalRow("asset.classify"),
        // [T-093] 知识库语义搜索 embedding(未配 = AI 搜索诚实降级关键词)。
        embed: multimodalRow("knowledge.search.embed"),
        // [T-086] 文案审核模型(未配 = 用默认模型审核,报告标注非专用)。
        review: multimodalRow("script.review"),
        // [T-084a] 联网搜索(未配 = 素材来自模型记忆,卡片黄条+需核实徽标)。
        search: multimodalRow("web.search"),
        // [T-239b] 备用对话模型(未配 = 主模型重试耗尽后现状报错,不静默换模型)。
        fallback: multimodalRow("chat.fallback"),
      };
    } catch {
      // [FE-H02] listModels 读失败 → 文本模型卡诚实显「未配置」(model 保持 UNCONFIGURED_MODEL);
      // multimodalModels 留 undefined → 走 fixture 的**全空**多模态默认(本就诚实未配置,非伪造)。
      model = UNCONFIGURED_MODEL;
    }
  }

  // Read the real DB-backed storage config + usage (settings.storage.get) so the
  // StorageUsageCard shows the real media root / backend / used-vs-capacity /
  // per-type breakdown.
  // [FE-H02] 读取失败 → 诚实置 0(EMPTY_STORAGE),绝不回退 fixture 伪造的 18GB/64GB 占用。
  let storage: StorageState = EMPTY_STORAGE;
  if (session) {
    try {
      const s = await createServerClient(session.ctx).getStorage({
        params: undefined,
        query: undefined,
        body: undefined,
      });
      storage = {
        backend: s.backend,
        rootPath: s.rootPath,
        usedBytes: s.usedBytes,
        totalBytes: s.totalBytes,
        breakdown: s.breakdown.map((b) => {
          const meta = STORAGE_TYPE_LABELS[b.assetType] ?? {
            label: b.assetType,
            tone: "neutral" as const,
          };
          return {
            assetType: b.assetType,
            label: meta.label,
            bytes: b.bytes,
            tone: meta.tone,
          };
        }),
      };
    } catch {
      // [FE-H02] getStorage 读失败 → 诚实置 0(storage 保持 EMPTY_STORAGE),绝不回退 fixture 假占用。
      storage = EMPTY_STORAGE;
    }
  }

  // 抖音登录状态(ingestion.douyin.status)故意**不在 SSR 读**:该被动探针会 headless 起
  // Chromium 查 cookie(见 douyin-cdp.checkDouyinStatus),放到 SSR 会让每次打开设置页都
  // spawn 一个浏览器、阻塞 RSC、且在无 Playwright/.auth 的环境直接抛错。改由客户端的
  // AccountBindingCard 挂载后拉 status(见 settings-interactive-region.tsx),SSR 默认徽标
  // 走 fixture 的「未连接」(诚实兜底,绝不假装已连接)。故这里不传 douyinAccount。

  // [T-051 2e] 偏好读真(settings.preferences.get):patch 落库的值刷新后能读回,
  // 不再永远渲染 fixture 默认(写真读假环闭合)。读失败 → undefined(fixture 默认)。
  let preferences: PreferencesState | undefined;
  if (session) {
    try {
      const pref = await createServerClient(session.ctx).getPreferences({
        params: undefined,
        query: undefined,
        body: undefined,
      });
      // [T-247 假设置清算] 只投影有真实消费方的两项;其余契约字段保留兼容不再读。
      preferences = {
        defaultCreationMode: pref.defaultCreationMode,
        autosaveEnabled: pref.autosaveEnabled,
      };
    } catch {
      preferences = undefined;
    }
  }

  // [T-513] 技能清单只读服务端 official + 当前账号增量的联合目录。页面不得再 import
  // ai-worker 本地 registry 自行拼接，否则 SSR 可能看到另一个账号或旧 global 覆盖。
  let skills: readonly SkillItem[] | undefined;
  if (session) {
    try {
      const catalog = await createServerClient(session.ctx).listPrompts({
        params: undefined,
        query: undefined,
        body: undefined,
      });
      skills = buildSkillItems(catalog);
    } catch {
      // 目录不可用时诚实显空态；不能回退本地 registry，因为那会丢失账号归属。
      skills = undefined;
    }
  }

  // [T-167] 桌面激活状态(账户页签的激活卡)。**只桌面态读**:isDesktopRuntime 判 false
  // (web/dev)→ 不触碰 getActivationService(),直接留 undefined → 卡片显「桌面端专属」诚实
  // 空态,绝不假装已激活。桌面态经 getStatus() 本地读(不打网络);读失败(装配态/transport
  // race)也退回 undefined(同 web 空态,诚实兜底)。
  let activation: ActivationState | undefined;
  if (isDesktopRuntime()) {
    try {
      const status = await (await getActivationService()).getStatus();
      activation = {
        status: status.status,
        machineId: status.machineId,
        licenseMode: status.licenseMode,
        expiresAt: status.expiresAt,
        activatedAt: status.activatedAt,
        lastOnlineCheckAt: status.lastOnlineCheckAt,
        // [T-372 L3] 展示副本三列:上次确认 X 天前 / 码型宽限 / 撤销停更新提示。
        lastSeenAt: status.lastSeenAt,
        graceSeconds: status.graceSeconds,
        revoked: status.revoked,
      };
    } catch {
      // 激活服务不可用(装配态 / transport race)→ 退回空态卡(诚实,不误显激活)。
      activation = undefined;
    }
  }

  // [T-534] 渠道 runtime 只从 Rust 已验证并写入加密 `.license` 的投影读取。
  let channelLinks: ChannelLinksState | undefined;
  let modelAuthority: ModelAuthorityState | undefined;
  if (isDesktopRuntime()) {
    const runtime = await readChannelRuntime();
    channelLinks = {
      purchaseUrl: runtime.purchaseUrl,
      renewalUrl: runtime.renewalUrl,
      channelSupportUrl: runtime.channelSupportUrl,
      downloadUrl: runtime.downloadUrl,
    };
    const authority = await readChannelModelAuthority();
    const actions = {
      configured: "渠道模型正在使用",
      not_configured: "本地模型正在使用 · 渠道未配置",
      unreachable: "本地模型正在使用 · 暂时无法取得渠道配置",
      security_error: "本地模型正在使用 · 渠道配置安全校验未通过",
    } as const;
    modelAuthority = {
      authority: authority.authority,
      outcome: authority.outcome,
      action: actions[authority.outcome],
    };
  }

  return (
    <SettingsPage
      identity={identity}
      model={model}
      modelAuthority={modelAuthority}
      storage={storage}
      multimodalModels={multimodalModels}
      preferences={preferences}
      skills={skills}
      activation={activation}
      channelLinks={channelLinks}
    />
  );
}
