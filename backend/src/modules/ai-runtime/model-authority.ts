import type { RequestContext } from "@creatoros/contract";
import type { ModelConfigInternal } from "../settings";

export type ModelConfigurationAuthority = "local" | "managed_locked";

export type ModelAuthoritySnapshot =
  | { authority: "local"; state: "ready"; action: string }
  | {
      authority: "managed_locked";
      state: "ready" | "offline";
      action: string;
      profileKey: "balanced" | "quality";
      capabilityRoutes: Readonly<Record<string, string>>;
    }
  | {
      authority: "managed_locked";
      state: "unavailable";
      action: string;
    };

export type ManagedGatewaySession = {
  gatewayOrigin: string;
  credential: {
    kind: "bearer";
    value: string;
    expiresAt: string;
  };
  binding: {
    capability: string;
    alias: string;
    entitlementBindingDigest: string;
  };
};

export interface ManagedGatewaySessionPort {
  open(
    ctx: RequestContext,
    input: {
      capability: string;
      alias: string;
      profileKey: "balanced" | "quality";
    },
  ): Promise<ManagedGatewaySession>;
}

export type EffectiveModelConfig =
  | { source: "local"; config: ModelConfigInternal | null }
  | {
      source: "managed";
      alias: string;
      gatewayOrigin: string;
      apiFormat: "openai_responses";
      credential: ManagedGatewaySession["credential"];
    };

export interface ManagedModelConfigPort {
  resolve(
    ctx: RequestContext,
    input: {
      capability: string;
      alias: string;
      profileKey: "balanced" | "quality";
    },
  ): Promise<Extract<EffectiveModelConfig, { source: "managed" }>>;
}

export interface EffectiveModelConfigPort {
  authority(): Promise<ModelAuthoritySnapshot>;
  get(
    ctx: RequestContext,
    capability: string,
  ): Promise<EffectiveModelConfig>;
  describe(
    ctx: RequestContext,
    capability: string,
  ): Promise<{ modelKey: string }>;
}

export class ModelConfigurationManagedError extends Error {
  readonly code = "MODEL_CONFIGURATION_MANAGED";
  readonly status = 409;

  constructor() {
    super("模型服务由当前渠道统一管理，CreatorOS 不支持本地修改");
    this.name = "ModelConfigurationManagedError";
  }
}

export class ManagedModelUnavailableError extends Error {
  readonly code: string;

  constructor(
    code:
      | "MANAGED_MODEL_POLICY_UNAVAILABLE"
      | "MANAGED_MODEL_CAPABILITY_UNAVAILABLE"
      | "MANAGED_GATEWAY_UNAVAILABLE"
      | "MANAGED_GATEWAY_SESSION_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "ManagedModelUnavailableError";
    this.code = code;
  }
}

export interface ModelAuthorityGuard {
  snapshot(): Promise<ModelAuthoritySnapshot>;
  isManaged(): Promise<boolean>;
  assertLocalConfigurationAllowed(): Promise<void>;
}

export function createModelAuthorityGuard(
  readSnapshot: () => Promise<ModelAuthoritySnapshot>,
): ModelAuthorityGuard {
  return {
    snapshot: readSnapshot,
    async isManaged() {
      return (await readSnapshot()).authority === "managed_locked";
    },
    async assertLocalConfigurationAllowed() {
      if ((await readSnapshot()).authority === "managed_locked") {
        throw new ModelConfigurationManagedError();
      }
    },
  };
}

export function createUnavailableManagedModelConfigPort(): ManagedModelConfigPort {
  return {
    async resolve() {
      throw new ManagedModelUnavailableError(
        "MANAGED_GATEWAY_UNAVAILABLE",
        "渠道模型网关尚未就绪，请稍后重试",
      );
    },
  };
}

export function createManagedModelConfigPort(
  sessions: ManagedGatewaySessionPort,
  options: { now?: () => Date; maxTtlMs?: number } = {},
): ManagedModelConfigPort {
  const now = options.now ?? (() => new Date());
  const maxTtlMs = options.maxTtlMs ?? 15 * 60 * 1000;
  return {
    async resolve(ctx, input) {
      const session = await sessions.open(ctx, input);
      const expiresAt = Date.parse(session.credential.expiresAt);
      const current = now().getTime();
      if (
        session.credential.kind !== "bearer" ||
        !session.credential.value ||
        !session.gatewayOrigin ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= current ||
        expiresAt - current > maxTtlMs ||
        session.binding.capability !== input.capability ||
        session.binding.alias !== input.alias ||
        !session.binding.entitlementBindingDigest
      ) {
        throw new ManagedModelUnavailableError(
          "MANAGED_GATEWAY_SESSION_INVALID",
          "渠道模型会话无效，请重新联网后重试",
        );
      }
      return {
        source: "managed",
        alias: input.alias,
        gatewayOrigin: session.gatewayOrigin,
        apiFormat: "openai_responses",
        credential: session.credential,
      };
    },
  };
}

export function createEffectiveModelConfigPort(deps: {
  readSnapshot: () => Promise<ModelAuthoritySnapshot>;
  getLocalModelConfig: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelConfigInternal | null>;
  managed: ManagedModelConfigPort;
}): EffectiveModelConfigPort {
  async function managedRoute(
    capability: string,
  ): Promise<{
    snapshot: Extract<
      ModelAuthoritySnapshot,
      { authority: "managed_locked"; state: "ready" | "offline" }
    >;
    alias: string;
  }> {
    const snapshot = await deps.readSnapshot();
    if (
      snapshot.authority !== "managed_locked" ||
      snapshot.state === "unavailable"
    ) {
      throw new ManagedModelUnavailableError(
        "MANAGED_MODEL_POLICY_UNAVAILABLE",
        snapshot.action,
      );
    }
    const alias = snapshot.capabilityRoutes[capability];
    if (!alias) {
      throw new ManagedModelUnavailableError(
        "MANAGED_MODEL_CAPABILITY_UNAVAILABLE",
        `当前渠道未启用模型能力：${capability}`,
      );
    }
    return { snapshot, alias };
  }

  return {
    authority: deps.readSnapshot,
    async get(ctx, capability) {
      const snapshot = await deps.readSnapshot();
      if (snapshot.authority === "local") {
        return {
          source: "local",
          config: await deps.getLocalModelConfig(ctx, capability),
        };
      }
      const route = await managedRoute(capability);
      return deps.managed.resolve(ctx, {
        capability,
        alias: route.alias,
        profileKey: route.snapshot.profileKey,
      });
    },
    async describe(ctx, capability) {
      const snapshot = await deps.readSnapshot();
      if (snapshot.authority === "local") {
        const config =
          (await deps.getLocalModelConfig(ctx, capability)) ??
          (capability === "default"
            ? null
            : await deps.getLocalModelConfig(ctx, "default"));
        return { modelKey: config?.modelName ?? capability };
      }
      const route = await managedRoute(capability);
      return { modelKey: route.alias };
    },
  };
}
