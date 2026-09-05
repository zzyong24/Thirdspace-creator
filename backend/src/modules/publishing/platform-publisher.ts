import type { RequestContext } from "@creatoros/contract";
import { PublishingUnavailableError } from "./publishing.errors";

// Platform-publisher swap-seam (foundation §4). PublishingService is the ONLY
// module allowed to drive a platform publish/remove side-effect — it depends on
// this port, never a concrete platform SDK (SPEC §15: "禁止 … Publishing … 直接
// 调用平台 SDK / S3"). 正式装配在真实平台适配器未实现时使用Unavailable；
// MockPublisher仅供显式隔离测试，不得作为正式发布结果来源。
//
// Determinism + idempotency (plan Open Question 5): the mock's external id is
// `mock:{platform}:{publicationId}` — stable across re-publishes, so a second
// publish of the same publication mints the SAME id and hits the
// `publications(platform, external_id)` partial-unique index, letting the service
// return the original row instead of duplicating (SPEC §17/§22). No Date.now /
// Math.random / crypto.

export interface PublishInput {
  publicationId: string;
  platform: string;
  accountReference: string;
  // The revision being published (title/description/tags/settings) — the mock
  // records it but does not transform it. The real adapter maps it to the
  // platform's upload payload.
  revision: {
    title: string;
    description: string;
    coverAssetId: string | null;
    platformTags: string[];
    platformSettings: Record<string, unknown>;
  } | null;
}

export interface PublishResult {
  externalId: string;
  externalUrl: string;
}

export interface PlatformPublisherPort {
  // Drive the platform publish. Returns the external fact (id + url) the service
  // stamps onto the Publication. Deterministic + idempotent in the mock.
  publish(ctx: RequestContext, input: PublishInput): Promise<PublishResult>;
  // Drive the platform takedown. Records the removal; retains nothing else (the
  // service keeps the Publication row + metrics history — SPEC §13.3).
  remove(
    ctx: RequestContext,
    input: { externalId: string | null },
  ): Promise<void>;
}

/** 无真实平台发布能力时的生产适配器；不制造外部ID、URL或发布/下架事实。 */
export function createUnavailablePublisher(): PlatformPublisherPort {
  return {
    async publish() { throw new PublishingUnavailableError("publish"); },
    async remove() { throw new PublishingUnavailableError("remove"); },
  };
}

export interface PublishRecord {
  userId: string;
  publicationId: string;
  platform: string;
  externalId: string;
  externalUrl: string;
  removed: boolean;
}

export interface MockPublisher extends PlatformPublisherPort {
  // Test/inspection hook — the recorded publish facts (per (platform, externalId)).
  records(): PublishRecord[];
}

// In-memory publisher. `publish` mints a deterministic external id, records the
// fact (keyed by the id so a re-publish overwrites the same record, never
// duplicates), and returns the fact. `remove` flips the record's `removed` flag.
export function createMockPublisher(): MockPublisher {
  const recorded = new Map<string, PublishRecord>();

  return {
    async publish(ctx, input) {
      const externalId = `mock:${input.platform}:${input.publicationId}`;
      const externalUrl = `mock://platform/${input.platform}/${input.publicationId}`;
      recorded.set(externalId, {
        userId: ctx.userId,
        publicationId: input.publicationId,
        platform: input.platform,
        externalId,
        externalUrl,
        removed: false,
      });
      return { externalId, externalUrl };
    },

    async remove(_ctx, input) {
      if (input.externalId) {
        const existing = recorded.get(input.externalId);
        if (existing) existing.removed = true;
      }
    },

    records() {
      return [...recorded.values()];
    },
  };
}
