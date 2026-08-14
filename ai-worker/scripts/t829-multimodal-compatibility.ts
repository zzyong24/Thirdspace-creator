import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  generateImage,
  generateVideo,
  type MultimodalSpec,
} from "../src/runtime/multimodal-factory.ts";
import { createOmnihiVideoAdapter } from "../src/runtime/multimodal-omnihi.ts";
import { createOpenaiImagesAdapter } from "../src/runtime/multimodal-openai-images.ts";

interface Connection {
  id: string;
  provider: string;
  baseURL: string;
  apiFormat: string;
}

interface ModelRow {
  connectionId: string;
  model: string;
  settings?: Record<string, unknown>;
}

interface ProductConfig {
  productConfig?: {
    payload?: {
      connections?: Connection[];
      models?: {
        "image.generate"?: ModelRow[];
        "video.generate"?: ModelRow[];
      };
    };
  };
}

const token = process.env.OMNIHI_TEST_API_KEY?.trim();
const configPath = process.env.T829_MODEL_CONFIG_PATH?.trim();
const referenceImageModel = process.env.T829_REFERENCE_IMAGE_MODEL?.trim();
const referenceImagePath = process.env.T829_REFERENCE_IMAGE_PATH?.trim();
const requested = new Set(
  (process.env.T829_MULTIMODAL ?? "image,reference-image,video")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

if (!token) throw new Error("OMNIHI_TEST_API_KEY_MISSING");
if (!configPath) throw new Error("T829_MODEL_CONFIG_PATH_MISSING");

const config = JSON.parse(await readFile(configPath, "utf8")) as ProductConfig;
const payload = config.productConfig?.payload;
if (!payload) throw new Error("T829_MODEL_CONFIG_INVALID");

function connectionFor(id: string): Connection {
  const connection = payload?.connections?.find((row) => row.id === id);
  if (!connection) throw new Error(`T829_CONNECTION_MISSING:${id}`);
  return connection;
}

function safeError(error: unknown): string {
  const row = error && typeof error === "object"
    ? (error as Record<string, unknown>)
    : {};
  const status = typeof row.status === "number" ? ` status=${row.status}` : "";
  const code = typeof row.code === "string" ? ` code=${row.code}` : "";
  const reason = typeof row.reason === "string" ? ` reason=${row.reason}` : "";
  const message = error instanceof Error ? error.message : String(error);
  return `${error instanceof Error ? error.name : "Error"}${status}${code}${reason}: ${message}`
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .slice(0, 900);
}

function mimeTypeOf(bytes: Uint8Array): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return "application/octet-stream";
}

function emit(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const imageRow = payload.models?.["image.generate"]?.[0];
let generatedImage: Uint8Array | null = referenceImagePath
  ? await readFile(referenceImagePath)
  : null;
if (requested.has("image") || (requested.has("reference-image") && !generatedImage)) {
  if (!imageRow) throw new Error("T829_IMAGE_MODEL_MISSING");
  const connection = connectionFor(imageRow.connectionId);
  const spec: MultimodalSpec = {
    provider: "openai-compatible",
    baseUrl: connection.baseURL,
    model: imageRow.model,
    token,
    kind: "image",
    settings: imageRow.settings,
    displayModelKey: "channel-managed",
  };
  const startedAt = Date.now();
  try {
    generatedImage = (
      await generateImage(
        spec,
        {
          prompt: "Minimal flat icon: one solid blue circle centered on a white background. No text.",
          aspectRatio: "1:1",
          idempotencyKey: "t829-image-20260814-v1",
        },
        { "openai-compatible": createOpenaiImagesAdapter() },
      )
    ).assetBytes;
    emit({
      capability: "image.generate",
      probe: "text-to-image",
      ok: true,
      durationMs: Date.now() - startedAt,
      bytes: generatedImage.length,
      mimeType: mimeTypeOf(generatedImage),
    });
  } catch (error) {
    emit({
      capability: "image.generate",
      probe: "text-to-image",
      ok: false,
      durationMs: Date.now() - startedAt,
      error: safeError(error),
    });
  }
}

if (requested.has("reference-image")) {
  if (!generatedImage) {
    emit({
      capability: "image.generate",
      probe: "reference-image",
      ok: false,
      skipped: "text-to-image did not return reusable bytes",
    });
  } else {
    const connection = connectionFor(imageRow!.connectionId);
    const startedAt = Date.now();
    try {
      const output = await generateImage(
        {
          provider: "openai-compatible",
          baseUrl: connection.baseURL,
          model: referenceImageModel || imageRow!.model,
          token,
          kind: "image",
          settings: imageRow!.settings,
          displayModelKey: "channel-managed",
        },
        {
          prompt: "Keep the composition, change the blue circle to red. No text.",
          aspectRatio: "1:1",
          referenceImage: {
            bytes: generatedImage,
            mimeType: mimeTypeOf(generatedImage),
          },
          idempotencyKey: "t829-reference-image-20260814-v1",
        },
        { "openai-compatible": createOpenaiImagesAdapter() },
      );
      emit({
        capability: "image.generate",
        probe: "reference-image",
        model: referenceImageModel || imageRow!.model,
        ok: true,
        durationMs: Date.now() - startedAt,
        bytes: output.assetBytes.length,
        mimeType: mimeTypeOf(output.assetBytes),
      });
    } catch (error) {
      emit({
        capability: "image.generate",
        probe: "reference-image",
        model: referenceImageModel || imageRow!.model,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: safeError(error),
      });
    }
  }
}

if (requested.has("video")) {
  const videoRow = payload.models?.["video.generate"]?.[0];
  if (!videoRow) throw new Error("T829_VIDEO_MODEL_MISSING");
  const connection = connectionFor(videoRow.connectionId);
  const spec: MultimodalSpec = {
    provider: "omnihi",
    baseUrl: connection.baseURL,
    model: videoRow.model,
    token,
    kind: "video",
    settings: videoRow.settings,
    displayModelKey: "channel-managed",
  };
  const startedAt = Date.now();
  try {
    const output = await generateVideo(
      spec,
      {
        prompt: "A solid blue circle slowly moves from left to right on a white background. No text.",
        aspectRatio: "9:16",
        idempotencyKey: "t829-video-20260814-v1",
      },
      { omnihi: createOmnihiVideoAdapter() },
    );
    emit({
      capability: "video.generate",
      probe: "text-to-video",
      ok: true,
      durationMs: Date.now() - startedAt,
      bytes: output.assetBytes.length,
    });
  } catch (error) {
    emit({
      capability: "video.generate",
      probe: "text-to-video",
      ok: false,
      durationMs: Date.now() - startedAt,
      error: safeError(error),
    });
  }
}

if (requested.has("reference-video")) {
  emit({
    capability: "video.generate",
    probe: "reference-image-to-video",
    ok: false,
    unsupported: true,
    reason: "The signed channel model declares mode=t2v and the OmniHi adapter does not send firstFrame.",
  });
}
