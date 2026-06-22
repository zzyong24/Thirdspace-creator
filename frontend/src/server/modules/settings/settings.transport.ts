import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "@creatoros/backend";
import type { SettingsService } from "./settings.service";
import type { PreferencePatch, ModelPutBody } from "./settings.repository";

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
  "settings.get",
  "settings.preferences.patch",
  "settings.models.put",
  "settings.agents.create",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createSettingsTransport(
  serviceFactory: (ctx: RequestContext) => SettingsService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      // Every settings op is persisted (owned). No ctx ⇒ unauthenticated dispatch
      // ⇒ reject before touching the store.
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory(ctx);

      const { params, body } = (input ?? {}) as Input;

      switch (endpoint.id) {
        case "settings.get": {
          const data = await service.getAccount(ctx);
          return { data, meta: { requestId: ctx.requestId } };
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
        case "settings.agents.create": {
          const b = (body ?? {}) as { name?: string; agentType?: string };
          const data = await service.createAgentConfiguration(ctx, {
            name: b.name ?? "",
            agentType: b.agentType ?? "",
          });
          return { data, meta: { requestId: ctx.requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}
