import * as fs from "node:fs/promises";
import type { RequestContext } from "@creatoros/backend";
import type {
  SettingsRepository,
  UserPreferenceRow,
  ModelConfigurationRow,
  AgentConfigurationRow,
  StorageConfigRow,
  PreferencePatch,
  ModelPutBody,
  AgentCreateInput,
  StorageConfigPatch,
} from "./settings.repository";
import type {
  UserResource,
  UserPreferenceResource,
  ModelConfigurationResource,
  AgentConfigurationResource,
  StorageConfigResource,
} from "./settings.schema";
import { resolveRootPath } from "@creatoros/backend/modules/assets";
import { rootPathLegalityReason } from "@creatoros/backend/modules/assets";
import { StorageValidationError } from "./settings.errors";

// SettingsService (foundation §5.3) — RequestContext-taking methods. Settings has
// NO §12 business state machine (plan §11: preferences/model/agent are mutable
// singletons/upserts, not lifecycle entities); the service is validation
// (delegated to the contract Zod on the transport edge) + repo orchestration +
// the AI-consumed read (resolveModelForCapability).
//
// The account read (`getAccount` → settings.get) is NOT owned by Settings —
// Settings does not own the `users` table. It is injected as an `accountReader`
// function (the Identity service's `getCurrentUser`, threaded at composition
// time) so there is NO cross-module repository import (foundation §1; modules
// import each other only via index.ts). The repo is supplied via a per-ctx
// factory (mirrors notifications/search), keeping the service db-agnostic.

// The AI-consumed model resolution (foundation §3; the worker's ClaudeAgentRunner
// reads it). Deterministic hard default per foundation §3.
export interface ResolvedModel {
  provider: string;
  modelName: string;
}

const HARD_DEFAULT_MODEL: ResolvedModel = {
  provider: "anthropic",
  modelName: "claude-opus-4-8",
};

// The AI-consumed model config (resolve.ts reads this) — carries the RAW secret
// (secretValue) so resolve can authenticate. Server-only; NEVER serialized to the
// client. The public DTO (toModelResource) masks the secret to `hasSecret`.
// resolve prefers secretValue, else resolves secretReference via env.
export interface ModelConfigInternal {
  provider: string;
  modelName: string;
  baseUrl: string | null;
  apiFormat: "anthropic" | "openai_chat";
  secretReference: string;
  secretValue: string | null;
  settings: Record<string, unknown>;
}

/** Reads the authenticated user's account row (Identity's getCurrentUser). */
export type AccountReader = (ctx: RequestContext) => Promise<UserResource>;

/**
 * The editable account-profile fields (`PATCH /me`). Every key optional — only
 * the provided keys are written. Settings does NOT own `users`, so the write is
 * injected (Identity's updateProfile), mirroring the read-side `accountReader`.
 */
export interface AccountProfilePatch {
  displayName?: string;
  locale?: string;
}

/** Writes the authenticated user's profile (Identity's updateProfile). */
export type AccountWriter = (
  ctx: RequestContext,
  patch: AccountProfilePatch,
) => Promise<UserResource>;

export interface SettingsService {
  getAccount(ctx: RequestContext): Promise<UserResource>;
  updateAccount(
    ctx: RequestContext,
    patch: AccountProfilePatch,
  ): Promise<UserResource>;
  updatePreferences(
    ctx: RequestContext,
    patch: PreferencePatch,
  ): Promise<UserPreferenceResource>;
  setModelConfiguration(
    ctx: RequestContext,
    capability: string,
    body: ModelPutBody,
  ): Promise<ModelConfigurationResource>;
  resolveModelForCapability(
    ctx: RequestContext,
    capability: string,
  ): Promise<ResolvedModel>;
  getModelConfig(
    ctx: RequestContext,
    capability: string,
  ): Promise<ModelConfigInternal | null>;
  listModelConfigs(
    ctx: RequestContext,
  ): Promise<ModelConfigurationResource[]>;
  createAgentConfiguration(
    ctx: RequestContext,
    input: AgentCreateInput,
  ): Promise<AgentConfigurationResource>;
  // item B — read the resolved storage config + real usage.
  getStorage(ctx: RequestContext): Promise<StorageConfigResource>;
  // item B — update the backend choice / media root (validated: an illegal /
  // non-writable path throws StorageValidationError, never silently accepted).
  updateStorage(
    ctx: RequestContext,
    patch: StorageConfigPatch,
  ): Promise<StorageConfigResource>;
  // item B — resolve the absolute media root for the ctx user (the per-ctx
  // storage-adapter factory + the blob route both call this so uploads land at
  // and are served from the same on-disk location). Settings only computes the
  // path string — it never touches the storage port itself (SPEC §15).
  resolveStorageRoot(ctx: RequestContext): Promise<string>;
  // item B — the resolved backend ('local' | 's3') for the ctx user (the per-ctx
  // factory uses it to choose the adapter).
  resolveStorageBackend(ctx: RequestContext): Promise<"local" | "s3">;
}

// USER_PREFERENCE is keyed by user_id (no own id column), but the DTO requires an
// `id`. Synthesize a stable, deterministic id from the user id (plan §31).
function toPreferenceResource(
  ctx: RequestContext,
  row: UserPreferenceRow,
): UserPreferenceResource {
  return {
    id: `pref-${ctx.userId}`,
    userId: row.userId,
    defaultHome: row.defaultHome,
    defaultCreationMode:
      row.defaultCreationMode as UserPreferenceResource["defaultCreationMode"],
    defaultVisibility:
      row.defaultVisibility as UserPreferenceResource["defaultVisibility"],
    autosaveEnabled: row.autosaveEnabled,
    fileNamingRule: row.fileNamingRule,
    analyticsEnabled: row.analyticsEnabled,
  };
}

function toModelResource(
  row: ModelConfigurationRow,
): ModelConfigurationResource {
  return {
    id: row.id,
    userId: row.userId,
    capability: row.capability,
    provider: row.provider,
    modelName: row.modelName,
    secretReference: row.secretReference,
    baseUrl: row.baseUrl ?? null,
    apiFormat: (row.apiFormat as "anthropic" | "openai_chat") ?? "anthropic",
    settings: (row.settings as Record<string, unknown>) ?? {},
    isDefault: row.isDefault,
    // Masked: a usable secret is configured (stored value OR env-ref). The raw
    // secret value is NEVER serialized — only this boolean.
    hasSecret:
      Boolean(row.secretValue && row.secretValue.length > 0) ||
      Boolean(row.secretReference && row.secretReference.length > 0),
  };
}

// Server-only projection for resolve.ts — carries the RAW secret. Never serialize.
function toModelInternal(row: ModelConfigurationRow): ModelConfigInternal {
  return {
    provider: row.provider,
    modelName: row.modelName,
    baseUrl: row.baseUrl ?? null,
    apiFormat: (row.apiFormat as "anthropic" | "openai_chat") ?? "anthropic",
    secretReference: row.secretReference,
    secretValue: row.secretValue ?? null,
    settings: (row.settings as Record<string, unknown>) ?? {},
  };
}

function toAgentResource(
  row: AgentConfigurationRow,
): AgentConfigurationResource {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    agentType: row.agentType,
    status: row.status,
    capabilities: (row.capabilities as Record<string, unknown>) ?? {},
    settings: (row.settings as Record<string, unknown>) ?? {},
    secretReference: row.secretReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSettingsService(
  repoForCtx: (ctx: RequestContext) => SettingsRepository,
  accountReader: AccountReader,
  accountWriter: AccountWriter,
): SettingsService {
  return {
    async getAccount(ctx) {
      // Delegated to Identity (injected). Settings does not own `users`.
      return accountReader(ctx);
    },

    async updateAccount(ctx, patch) {
      // Delegated to Identity (injected) — the same boundary as the read.
      // Settings owns NO `users` repo; the profile write lives in Identity.
      return accountWriter(ctx, patch);
    },

    async updatePreferences(ctx, patch) {
      const row = await repoForCtx(ctx).patchPreferences(ctx, patch);
      return toPreferenceResource(ctx, row);
    },

    async setModelConfiguration(ctx, capability, body) {
      const row = await repoForCtx(ctx).putModel(ctx, capability, body);
      return toModelResource(row);
    },

    async resolveModelForCapability(ctx, capability) {
      const repo = repoForCtx(ctx);
      // 1) exact capability match.
      const exact = await repo.getModel(ctx, capability);
      if (exact) return { provider: exact.provider, modelName: exact.modelName };
      // 2) the user's `isDefault` row (any capability).
      const all = await repo.listModels(ctx);
      const fallback = all.find((m) => m.isDefault);
      if (fallback) {
        return { provider: fallback.provider, modelName: fallback.modelName };
      }
      // 3) deterministic hard default (foundation §3).
      return { ...HARD_DEFAULT_MODEL };
    },

    async getModelConfig(ctx, capability) {
      const row = await repoForCtx(ctx).getModel(ctx, capability);
      return row ? toModelInternal(row) : null;
    },

    async listModelConfigs(ctx) {
      const rows = await repoForCtx(ctx).listModels(ctx);
      return rows.map(toModelResource);
    },

    async createAgentConfiguration(ctx, input) {
      const row = await repoForCtx(ctx).createAgent(ctx, input);
      return toAgentResource(row);
    },

    async resolveStorageRoot(ctx) {
      const row = await repoForCtx(ctx).getStorageConfig(ctx);
      return resolveRootPath(row?.rootPath);
    },

    async resolveStorageBackend(ctx) {
      const row = await repoForCtx(ctx).getStorageConfig(ctx);
      return (row?.backend as "local" | "s3") ?? "local";
    },

    async getStorage(ctx) {
      const repo = repoForCtx(ctx);
      const row = await repo.getStorageConfig(ctx);
      const usage = await repo.sumUsageByAssetType(ctx);
      return buildStorageResource(row, usage);
    },

    async updateStorage(ctx, patch) {
      // Validate the proposed rootPath (when provided) BEFORE persisting: reject
      // an illegal shape (system dir / fs root / empty) and probe writability via
      // mkdir -p. A failure throws StorageValidationError (→400), never silently
      // accepts a bad path.
      if (patch.rootPath !== undefined) {
        const resolved = resolveRootPath(patch.rootPath);
        const reason = rootPathLegalityReason(resolved);
        if (reason) throw new StorageValidationError(reason);
        try {
          await fs.mkdir(resolved, { recursive: true });
          // Probe writability with a throwaway file (removed immediately).
          const probe = `${resolved}/.creatoros-write-probe`;
          await fs.writeFile(probe, "");
          await fs.rm(probe, { force: true });
        } catch {
          throw new StorageValidationError(
            `media root is not writable: ${resolved}`,
          );
        }
      }
      const repo = repoForCtx(ctx);
      const row = await repo.putStorageConfig(ctx, patch);
      const usage = await repo.sumUsageByAssetType(ctx);
      return buildStorageResource(row, usage);
    },
  };
}

// Asset types surfaced in the StorageUsageCard breakdown (stable order). The
// usage query only returns types with files; the resource fills missing ones with
// 0 so the card always shows the same rows.
const STORAGE_BREAKDOWN_TYPES = [
  "video",
  "image",
  "audio",
  "document",
  "subtitle",
] as const;

// Build the storage DTO from the (possibly absent) config row + the real usage
// rows. `totalBytes` is the capacity of the disk that holds the resolved root
// (fs.statfs); 0 when it can't be read. `usedBytes` is the SUM across types.
async function buildStorageResource(
  row: StorageConfigRow | null,
  usage: { assetType: string; bytes: number }[],
): Promise<StorageConfigResource> {
  const rootPath = resolveRootPath(row?.rootPath);
  const backend = (row?.backend as "local" | "s3") ?? "local";
  const byType = new Map(usage.map((u) => [u.assetType, u.bytes]));
  const breakdown = STORAGE_BREAKDOWN_TYPES.map((assetType) => ({
    assetType,
    bytes: byType.get(assetType) ?? 0,
  }));
  const usedBytes = breakdown.reduce((sum, b) => sum + b.bytes, 0);
  let totalBytes = 0;
  try {
    const stat = await fs.statfs(rootPath);
    totalBytes = Number(stat.blocks) * Number(stat.bsize);
  } catch {
    // Disk capacity unavailable (path missing on a fresh install / platform
    // without statfs) → 0; the card shows used without a hard cap.
    totalBytes = 0;
  }
  return { backend, rootPath, usedBytes, totalBytes, breakdown };
}
