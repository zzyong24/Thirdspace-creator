import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type {
  SettingsService,
  AccountProfilePatch,
  AccountSkillOverlayPutInput,
} from "./settings.service";
import type {
  PreferencePatch,
  ModelPutBody,
  StorageConfigPatch,
} from "./settings.repository";

// Settings transport (foundation §5.4) — the module's four contract ops served
// over REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized
// notifications transport: a `Transport` whose request(endpoint,input,ctx)
// switches on endpoint.id, delegates to a per-ctx service, and returns the SPEC
// §14 envelope. A persisted op reached with NO ctx is an unauthenticated dispatch
// → AuthenticationError (→401). Ops this transport does not own throw
// UnsupportedOperationError so the composite never masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from SETTINGS_OP_IDS (adding the module = registering it).

export const SETTINGS_OP_IDS = [
  "settings.onboarding.get", "settings.onboarding.patch",
  "settings.onboarding.group.get", "settings.onboarding.group.patch",
  "settings.redfox.get", "settings.redfox.put", "settings.redfox.delete",
  "settings.get",
  // `PATCH /me` (identity.profile.patch) is served HERE rather than by a bare
  // Identity route because Identity owns no dispatch transport — the Settings
  // transport already proxies the account READ (settings.get → accountReader),
  // so it proxies the account WRITE the same way (→ accountWriter). The op id
  // keeps the `identity.*` namespace because Identity owns the `users` table.
  "identity.profile.patch",
  "settings.preferences.get",
  "settings.preferences.patch",
  "settings.models.put",
  "settings.models.list",
  // T-645 composition-only：scope/service 合法性依赖当前已验签渠道 authority，
  // 由 persistence-client wrap 拦截；基础 settings transport 不接受客户端 scope。
  "settings.channelModelCredentials.list",
  "settings.channelModelCredentials.put",
  // [T-377] 测试连接:composition-only(本 transport 不实现 —— 探测要组合根的解析器 +
  // adapter registry,由 persistence-client 的 settingsWithModelTest wrap 拦截,同
  // projects.transcribe 约定;列在此处仅为进 PERSISTED_OPS 并路由到 settings 束)。
  "settings.models.test",
  // [T-248 批C] settings.agents.create 已删(孤 op,零调用方);service/repository 的
  // createAgentConfiguration 链保留(见 contract/src/operations/settings.ts 注)。
  "settings.storage.get",
  "settings.storage.put",
  // T-040c 提示词/skill 服务端可配 — list全表 / get单个 / put upsert. put 后的热更
  // (重套 override 进常驻 REGISTRY) 由 persistence-client 在装配处拦截, 不在此 transport.
  "settings.prompts.list",
  "settings.prompts.get",
  "settings.prompts.put",
  "settings.prompts.versions.list",
  "settings.prompts.rollback",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createSettingsTransport(
  serviceFactory: (ctx: RequestContext) => SettingsService,
  integrations?: ReturnType<typeof import("./integration-credentials").createIntegrationCredentials>,
  onboarding?: ReturnType<typeof import("./onboarding-state").createOnboardingState>,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every settings op is persisted (owned). No ctx ⇒ unauthenticated dispatch
      // ⇒ reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory(ctx);

      const { params, body } = (input ?? {}) as Input;

      switch (endpoint.id) {
        case "settings.onboarding.group.get": case "settings.onboarding.group.patch": {
          if(!onboarding)throw Error("ONBOARDING_SETTINGS_UNAVAILABLE");
          const groupId=(params as {groupId?:string}|undefined)?.groupId??"";
          const data=endpoint.id==="settings.onboarding.group.get"?await onboarding.getGroup(ctx,groupId):await onboarding.patchGroup(ctx,groupId,body as import("@creatoros/contract").OnboardingPatch);
          return {data,meta:{requestId:ctx.requestId}};
        }
        case "settings.onboarding.get": case "settings.onboarding.patch": {
          if (!onboarding) throw Error("ONBOARDING_SETTINGS_UNAVAILABLE");
          const accountId=(params as {accountId?:string}|undefined)?.accountId??"";
          const data=endpoint.id==="settings.onboarding.get"
            ? await onboarding.get(ctx,accountId)
            : await onboarding.patch(ctx,accountId,body as import("@creatoros/contract").OnboardingPatch);
          return {data,meta:{requestId:ctx.requestId}};
        }
        case "settings.redfox.get": case "settings.redfox.put": case "settings.redfox.delete": {
          if(!integrations)throw Error("REDFOX_SETTINGS_UNAVAILABLE");
          const data=endpoint.id==="settings.redfox.get"?await integrations.status(ctx):endpoint.id==="settings.redfox.delete"?await integrations.remove(ctx):await integrations.save(ctx,(body as {secret:string}).secret);
          return {data,meta:{requestId:ctx.requestId}};
        }
        case "settings.get": {
          const data = await service.getAccount(ctx);
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "identity.profile.patch": {
          const data = await service.updateAccount(
            ctx,
            (body ?? {}) as AccountProfilePatch,
          );
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.preferences.get": {
          const pref = await service.getPreferences(ctx);
          return { data: pref, meta: { requestId: ctx.requestId } };
        }
        case "settings.preferences.patch": {
          const data = await service.updatePreferences(
            ctx,
            (body ?? {}) as PreferencePatch,
          );
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.models.put": {
          const p = (params ?? {}) as { capability?: string };
          const data = await service.setModelConfiguration(
            ctx,
            p.capability ?? "",
            (body ?? {}) as ModelPutBody,
          );
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.models.list": {
          const data = await service.listModelConfigs(ctx);
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.storage.get": {
          const data = await service.getStorage(ctx);
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.storage.put": {
          const data = await service.updateStorage(
            ctx,
            (body ?? {}) as StorageConfigPatch,
          );
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.prompts.list": {
          const data = await service.listSkillConfigOverrides(ctx);
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.prompts.get": {
          const p = (params ?? {}) as { id?: string };
          const data = await service.getSkillConfigOverride(ctx, p.id ?? "");
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.prompts.put": {
          const p = (params ?? {}) as { id?: string };
          const b = (body ?? {}) as Omit<AccountSkillOverlayPutInput, "skillId">;
          const data = await service.putSkillConfigOverride(ctx, {
            skillId: p.id ?? "",
            ...b,
          });
          return { data, meta: { requestId: ctx.requestId } };
        }
        // [T-165] 版本历史列表 + 一键回滚。
        case "settings.prompts.versions.list": {
          const p = (params ?? {}) as { id?: string };
          const data = await service.listSkillConfigOverrideVersions(
            ctx,
            p.id ?? "",
          );
          return { data, meta: { requestId: ctx.requestId } };
        }
        case "settings.prompts.rollback": {
          const p = (params ?? {}) as { id?: string };
          const b = (body ?? {}) as {
            versionId?: string;
            expectedRevision?: number;
          };
          const data = await service.rollbackSkillConfigOverride(
            ctx,
            p.id ?? "",
            b.versionId ?? "",
            b.expectedRevision ?? 0,
          );
          return { data, meta: { requestId: ctx.requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
