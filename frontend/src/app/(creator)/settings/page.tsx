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
 * server read path. The preference / model / storage rows stay
 * fixture-derived (the seed mirrors the fixture exactly, so SSR stays
 * deterministic against the canonical user); their mutations persist through
 * the island ops and a `router.refresh()` re-runs this read. Falls back to
 * the session identity when the op read is unavailable (race / direct
 * render), then to the fixture default.
 */
import {
  SettingsPage,
  type PreferencesState,
  type ModelState,
  type MultimodalModelState,
  type MultimodalModelsState,
  type StorageState,
} from "@/features/settings/settings-page";
import {
  buildSkillItems,
  type BuiltinSkillShape,
  type SkillItem,
} from "@/features/settings/skills-data";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
// T-077a 技能页签:server 侧读 ai-worker REGISTRY(listTemplates 惰性 bootstrap 内置 18+)
// + exportSkillSchema(Zod → JSON Schema,只读展示)。仅只读,不在此写 REGISTRY。
import {
  listTemplates,
  exportSkillSchema,
} from "@creatoros/ai-worker";
import type { SkillConfigOverrideResource } from "@creatoros/contract";

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
  // reflect the stored provider / model / baseUrl / format / hasSecret. A read
  // failure leaves them undefined → the cards show the fixture default
  // (deterministic SSR fallback). A single list call feeds BOTH the text "default"
  // card AND the two multimodal (image.generate / video.generate) cards.
  let model: ModelState | undefined;
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
        };
      };
      multimodalModels = {
        image: multimodalRow("image.generate"),
        video: multimodalRow("video.generate"),
        audio: multimodalRow("transcribe.audio"),
        vision: multimodalRow("asset.classify"),
        // [T-093] 知识库语义搜索 embedding(未配 = AI 搜索诚实降级关键词)。
        embed: multimodalRow("knowledge.search.embed"),
      };
    } catch {
      // listModels unavailable (transport race) → fall back to the fixture.
    }
  }

  // Read the real DB-backed storage config + usage (settings.storage.get) so the
  // StorageUsageCard shows the real media root / backend / used-vs-capacity /
  // per-type breakdown. A read failure leaves it undefined → the card shows the
  // fixture default (deterministic SSR fallback).
  let storage: StorageState | undefined;
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
      // getStorage unavailable (transport race) → fall back to the fixture.
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
      preferences = {
        defaultHome: pref.defaultHome,
        defaultCreationMode: pref.defaultCreationMode,
        defaultVisibility: pref.defaultVisibility,
        autosaveEnabled: pref.autosaveEnabled,
        analyticsEnabled: pref.analyticsEnabled,
      };
    } catch {
      preferences = undefined;
    }
  }

  // [T-077a] 技能清单:内置模板(listTemplates,不依赖 db)× override 行(settings.prompts.list)
  // → 可序列化 SkillItem[](当前生效值 = override 归一后 ?? 内置;徽章 = 有效 override)。
  // override 读失败 → 只显内置(诚实降级,列表仍可看);模板读失败 → undefined(页签渲空态)。
  let skills: readonly SkillItem[] | undefined;
  try {
    const builtins: BuiltinSkillShape[] = listTemplates().map((tpl) => {
      // outputSchema(Zod)→ pretty JSON Schema 字符串;导出失败给 null(只读展示,尽力)。
      let outputSchemaJson: string | null = null;
      try {
        const schema = exportSkillSchema(tpl.id);
        outputSchemaJson = schema ? JSON.stringify(schema, null, 2) : null;
      } catch {
        outputSchemaJson = null;
      }
      return {
        id: tpl.id,
        version: tpl.version,
        system: tpl.system,
        template: tpl.template,
        requiredFacets: tpl.requiredFacets,
        tools: tpl.tools ?? [],
        outputSchemaJson,
      };
    });
    let overrides: readonly SkillConfigOverrideResource[] = [];
    if (session) {
      try {
        overrides = await createServerClient(session.ctx).listPrompts({
          params: undefined,
          query: undefined,
          body: undefined,
        });
      } catch {
        // override 表读失败 → 按纯内置显示(不假装有定制)。
        overrides = [];
      }
    }
    skills = buildSkillItems(builtins, overrides);
  } catch {
    // REGISTRY 读取失败(极端装配态)→ 页签显诚实空态。
    skills = undefined;
  }

  return (
    <SettingsPage
      identity={identity}
      model={model}
      storage={storage}
      multimodalModels={multimodalModels}
      preferences={preferences}
      skills={skills}
    />
  );
}
