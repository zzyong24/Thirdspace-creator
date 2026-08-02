import {
  ENDPOINTS,
  type ChannelModelCredentialResource,
  type RequestContext,
  type Transport,
} from "@creatoros/contract";
import {
  resolveChannelCapabilityRoute,
  type ChannelModelPayload,
} from "@creatoros/backend/modules/ai-runtime";

import type { ChannelModelAuthority } from "./activation/client-config.server";

const USER_VISIBLE_CAPABILITIES = [
  "default",
  "transcribe.audio",
  "image.generate",
  "video.generate",
] as const;

export interface SettingsChannelModelCredentialsDeps {
  settings: Transport;
  readAuthority: () => Promise<ChannelModelAuthority>;
  listCredentials: (
    ctx: RequestContext,
    scopeId: string,
  ) => Promise<readonly ChannelModelCredentialResource[]>;
  putCredential: (
    ctx: RequestContext,
    scopeId: string,
    serviceId: string,
    secret: string,
  ) => Promise<ChannelModelCredentialResource>;
}

function managedServiceIds(payload: ChannelModelPayload): readonly string[] {
  const ids = new Set<string>();
  for (const capability of USER_VISIBLE_CAPABILITIES) {
    const route = resolveChannelCapabilityRoute(payload, capability);
    if (route?.serviceId) ids.add(route.serviceId);
  }
  return [...ids];
}

function validationError(message: string): Error {
  const error = new Error(`ValidationError: ${message}`) as Error & {
    code: string;
  };
  error.code = "ValidationError";
  return error;
}

/**
 * T-645 composition-only API。scopeId 和受管 service 集合只从当前验签渠道配置取得，
 * 浏览器既不能指定作用域，也不能借接口给任意 service 写入 Key。
 */
export function createSettingsWithChannelModelCredentials(
  deps: SettingsChannelModelCredentialsDeps,
): Transport {
  return {
    async request(endpoint, input, ctx) {
      const isList = endpoint.id === ENDPOINTS.listChannelModelCredentials.id;
      const isPut = endpoint.id === ENDPOINTS.putChannelModelCredential.id;
      if (!isList && !isPut) {
        return deps.settings.request(endpoint, input, ctx);
      }
      if (!ctx) {
        throw new Error(
          "AuthenticationError: channel model credential requires ctx",
        );
      }

      const authority = await deps.readAuthority();
      if (authority.authority !== "channel") {
        if (isList) {
          return { data: [], meta: { requestId: ctx.requestId } };
        }
        throw validationError("当前渠道未提供可配置的模型服务");
      }

      const serviceIds = managedServiceIds(authority.payload);
      if (isList) {
        const saved = await deps.listCredentials(ctx, authority.scopeId);
        const savedByService = new Map(saved.map((row) => [row.serviceId, row]));
        const data = serviceIds.map(
          (serviceId): ChannelModelCredentialResource =>
            savedByService.get(serviceId) ?? {
              serviceId,
              hasSecret: false,
              updatedAt: null,
            },
        );
        return { data, meta: { requestId: ctx.requestId } };
      }

      const { params, body } = (input ?? {}) as {
        params?: { serviceId?: string };
        body?: { secret?: string };
      };
      const serviceId = params?.serviceId?.trim() ?? "";
      const secret = body?.secret?.trim() ?? "";
      if (!serviceIds.includes(serviceId)) {
        throw validationError("当前渠道未提供这个模型服务");
      }
      if (!secret) throw validationError("API Key 不能为空");
      const data = await deps.putCredential(
        ctx,
        authority.scopeId,
        serviceId,
        secret,
      );
      return { data, meta: { requestId: ctx.requestId } };
    },
  };
}

void ENDPOINTS.listChannelModelCredentials;
void ENDPOINTS.putChannelModelCredential;
