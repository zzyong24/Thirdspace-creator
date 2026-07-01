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
  type ModelState,
  type MultimodalModelState,
  type MultimodalModelsState,
  type StorageState,
} from "@/features/settings/settings-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

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

  return (
    <SettingsPage
      identity={identity}
      model={model}
      storage={storage}
      multimodalModels={multimodalModels}
    />
  );
}
