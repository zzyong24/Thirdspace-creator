import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

import type {
  ChannelModelPayload,
} from "@creatoros/backend/modules/ai-runtime";
import type {
  ChannelModelAuthority,
} from "@/server/activation/client-config.server";

export type PinnedTaskModelAuthority =
  | {
      authority: "channel-managed";
      digest: string;
      payload: ChannelModelPayload;
      scopeId: string;
    }
  | {
      authority: "local";
      digest: "local";
      payload: null;
      scopeId: null;
    };

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalJson(
          (value as Record<string, unknown>)[key],
        )}`,
    )
    .join(",")}}`;
}

export function pinModelAuthority(
  authority: ChannelModelAuthority,
): PinnedTaskModelAuthority {
  if (authority.authority === "local") {
    return { authority: "local", digest: "local", payload: null, scopeId: null };
  }
  return {
    authority: "channel-managed",
    digest: `sha256:${createHash("sha256")
      .update(canonicalJson({ scopeId: authority.scopeId, payload: authority.payload }))
      .digest("hex")}`,
    payload: authority.payload,
    scopeId: authority.scopeId,
  };
}

export function matchesPinnedModelAuthority(
  runtimeData: Record<string, unknown>,
  live: PinnedTaskModelAuthority,
): boolean {
  return (
    runtimeData.modelAuthority === live.authority &&
    runtimeData.modelAuthorityDigest === live.digest
  );
}

export class TaskModelAuthorityScope {
  private readonly storage =
    new AsyncLocalStorage<PinnedTaskModelAuthority>();

  currentPayload(): ChannelModelPayload | null | undefined {
    return this.storage.getStore()?.payload;
  }

  currentScopeId(): string | null | undefined {
    return this.storage.getStore()?.scopeId;
  }

  run<T>(
    pinned: PinnedTaskModelAuthority,
    execute: () => T,
  ): T {
    return this.storage.run(pinned, execute);
  }
}
