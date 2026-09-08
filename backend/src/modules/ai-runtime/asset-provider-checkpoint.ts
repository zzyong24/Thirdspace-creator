import {createHash} from "node:crypto";
export interface ProviderCheckpoint {
  schemaVersion: 1;
  capability: "image.generate" | "video.generate";
  inputFingerprint: string;
  state:
    | "submitting"
    | "submitted"
    | "submit_unknown"
    | "response_received"
    | "rejected";
  jobId?: string;
}

export function generationFingerprint(input: {
  intentId: string;
  capability: string;
  prompt: string;
  aspectRatio?: string;
  durationSec?: number;
  resolution?: string;
  spec: {provider:string;baseUrl:string|null;model:string;serviceId?:string};
}): string {
  return `sha256:${createHash("sha256")
    .update(
      JSON.stringify({
        intentId: input.intentId,
        capability: input.capability,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio ?? null,
        durationSec: input.durationSec ?? null,
        resolution: input.resolution ?? null,
        provider: input.spec.provider,
        baseUrl: input.spec.baseUrl,
        model: input.spec.model,
        serviceId: input.spec.serviceId ?? null,
      }),
    )
    .digest("hex")}`;
}


export function parseProviderCheckpoint(
  value: unknown,
  fingerprint: string,
): ProviderCheckpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.schemaVersion !== 1 ||
    (row.capability !== "image.generate" &&
      row.capability !== "video.generate") ||
    row.inputFingerprint !== fingerprint ||
    (row.state !== "submitting" &&
      row.state !== "submitted" &&
      row.state !== "submit_unknown" &&
      row.state !== "response_received" &&
      row.state !== "rejected")
  ) {
    return null;
  }
  if (
    row.jobId !== undefined &&
    (typeof row.jobId !== "string" || row.jobId.length < 1 || row.jobId.length > 512)
  ) {
    return null;
  }
  if(row.jobId!==undefined && row.state!=="submitted")return null;
  return row as unknown as ProviderCheckpoint;
}
