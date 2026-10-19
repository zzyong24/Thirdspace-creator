import { readFile } from "node:fs/promises";
import process from "node:process";

import { generateText, streamText, tool } from "ai";
import { z } from "zod";

import { runStructuredNode } from "../src/nodes/structured-node.ts";
import type { PromptTemplate } from "../src/prompt/template.ts";
import { modelFor } from "../src/runtime/provider-factory.ts";

type ProbeMode = "local-relay" | "channel-managed";
type ProbeName = "stream" | "tool" | "structured";

interface ConfigModel {
  model: string;
  ownedBy?: string;
}

interface ProductConfig {
  productConfig?: {
    payload?: {
      models?: {
        default?: ConfigModel[];
      };
    };
  };
}

interface ProbeResult {
  mode: ProbeMode;
  model: string;
  probe: ProbeName;
  ok: boolean;
  durationMs: number;
  evidence?: string;
  error?: string;
}

const token = process.env.OMNIHI_TEST_API_KEY?.trim();
const configPath = process.env.T829_MODEL_CONFIG_PATH?.trim();
const baseUrl =
  process.env.T829_TEXT_BASE_URL?.trim() || "https://api.omnihi.ai/openai";
const discoverModels = process.env.T829_DISCOVER_MODELS === "1";

if (!token) throw new Error("OMNIHI_TEST_API_KEY_MISSING");
if (!discoverModels && !configPath) throw new Error("T829_MODEL_CONFIG_PATH_MISSING");

async function loadModels(): Promise<ConfigModel[]> {
  if (!discoverModels) {
    const config = JSON.parse(await readFile(configPath!, "utf8")) as ProductConfig;
    return config.productConfig?.payload?.models?.default ?? [];
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`T829_MODEL_DISCOVERY_FAILED status=${response.status}`);
  const payload = (await response.json()) as { data?: unknown };
  if (!Array.isArray(payload.data) || payload.data.length > 500) {
    throw new Error("T829_MODEL_DISCOVERY_INVALID");
  }
  const rows = payload.data.flatMap((value): ConfigModel[] => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (
      typeof row.id !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(row.id)
    ) {
      return [];
    }
    return [{
      model: row.id,
      ...(typeof row.owned_by === "string" ? { ownedBy: row.owned_by } : {}),
    }];
  });
  return [...new Map(rows.map((row) => [row.model, row])).values()];
}

const models = await loadModels();
if (models.length === 0) throw new Error("T829_TEXT_MODELS_EMPTY");

const requestedMode = process.env.T829_MODE?.trim();
const modes: ProbeMode[] = requestedMode === "channel-managed" || requestedMode === "local-relay"
  ? [requestedMode]
  : ["channel-managed", "local-relay"];
const requestedModels = new Set(
  (process.env.T829_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const requestedProbes = new Set(
  (process.env.T829_PROBES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const delayMs = Math.max(0, Math.min(10_000, Number(process.env.T829_DELAY_MS ?? 0) || 0));
const timeoutMs = Math.max(
  120_000,
  Math.min(2_147_483_647, Number(process.env.T829_TIMEOUT_MS ?? 120_000) || 120_000),
);

function errorText(error: unknown): string {
  const row = error && typeof error === "object"
    ? (error as Record<string, unknown>)
    : {};
  const status =
    typeof row.status === "number"
      ? ` status=${row.status}`
      : typeof row.statusCode === "number"
        ? ` status=${row.statusCode}`
        : "";
  const code = typeof row.code === "string" ? ` code=${row.code}` : "";
  const message = error instanceof Error ? error.message : String(error);
  return `${error instanceof Error ? error.name : "Error"}${status}${code}: ${message}`
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>")
    .slice(0, 700);
}

function makeModel(model: string, mode: ProbeMode) {
  return modelFor({
    apiFormat: "openai_chat",
    baseUrl,
    model,
    token,
    structuredOutputs: false,
    ...(mode === "channel-managed"
      ? { displayModelKey: "channel-managed" as const }
      : {}),
  });
}

async function streamProbe(model: string, mode: ProbeMode): Promise<string> {
  const result = streamText({
    model: makeModel(model, mode),
    prompt: "只输出英文单词 OK，不要解释。",
    maxOutputTokens: 24,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  let text = "";
  let reasoning = "";
  for await (const part of result.fullStream) {
    if (part.type === "error") throw part.error;
    if (part.type === "text-delta") text += part.text;
    if (part.type === "reasoning-delta") reasoning += part.text;
    if (text.trim() || reasoning.trim()) break;
  }
  if (!text.trim() && !reasoning.trim()) throw new Error("EMPTY_STREAM");
  return text.trim() ? "text-delta" : "reasoning-delta";
}

async function toolProbe(model: string, mode: ProbeMode): Promise<string> {
  const result = await generateText({
    model: makeModel(model, mode),
    prompt: "调用 echo_probe 工具，参数 value 必须是 ok。不要直接回答。",
    tools: {
      echo_probe: tool({
        description: "返回兼容测试标记。",
        inputSchema: z.object({ value: z.literal("ok") }),
        execute: async ({ value }) => ({ value }),
      }),
    },
    toolChoice: { type: "tool", toolName: "echo_probe" },
    maxOutputTokens: 64,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });
  const call = result.toolCalls.find((item) => item.toolName === "echo_probe");
  if (!call) throw new Error("TOOL_CALL_MISSING");
  return "echo_probe";
}

const structuredSchema = z.object({
  status: z.literal("ok"),
  items: z.array(z.object({ id: z.number().int(), label: z.string() })).length(2),
});

const structuredTemplate: PromptTemplate = {
  id: "t829.compat.structured",
  version: "v1",
  system: "你是兼容测试助手。严格按要求输出 JSON，不要解释。",
  template:
    '只输出这个 JSON 对象：{"status":"ok","items":[{"id":1,"label":"A"},{"id":2,"label":"B"}]}',
  requiredFacets: [],
  outputSchema: structuredSchema,
};

async function structuredProbe(model: string, mode: ProbeMode): Promise<string> {
  const previousInfo = console.info;
  console.info = () => undefined;
  try {
    const result = await runStructuredNode({
      model: makeModel(model, mode),
      template: structuredTemplate,
      facets: {},
      outputSchema: structuredSchema,
      maxRetries: 0,
      maxOutputTokens: 128,
      timeoutMs,
      structuredOutputMode: "text",
    });
    if (result.object.status !== "ok" || result.object.items.length !== 2) {
      throw new Error("STRUCTURED_SCHEMA_MISMATCH");
    }
    return "schema-valid";
  } finally {
    console.info = previousInfo;
  }
}

const probes: Record<ProbeName, (model: string, mode: ProbeMode) => Promise<string>> = {
  stream: streamProbe,
  tool: toolProbe,
  structured: structuredProbe,
};

const selectedModels = requestedModels.size > 0
  ? models.filter((row) => requestedModels.has(row.model))
  : models;
const selectedProbes = (Object.entries(probes) as Array<
  [ProbeName, (model: string, mode: ProbeMode) => Promise<string>]
>).filter(([name]) => requestedProbes.size === 0 || requestedProbes.has(name));
if (selectedModels.length === 0) throw new Error("T829_SELECTED_MODELS_EMPTY");
if (selectedProbes.length === 0) throw new Error("T829_SELECTED_PROBES_EMPTY");

let failed = 0;
for (const mode of modes) {
  for (const row of selectedModels) {
    for (const [probe, run] of selectedProbes) {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      const startedAt = Date.now();
      let result: ProbeResult;
      try {
        const evidence = await run(row.model, mode);
        result = {
          mode,
          model: row.model,
          probe,
          ok: true,
          durationMs: Date.now() - startedAt,
          evidence,
        };
      } catch (error) {
        failed += 1;
        result = {
          mode,
          model: row.model,
          probe,
          ok: false,
          durationMs: Date.now() - startedAt,
          error: errorText(error),
        };
      }
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  }
}

process.stdout.write(
  `${JSON.stringify({ summary: true, discovered: discoverModels, inventoryModels: models.length, models: selectedModels.length, modes: modes.length, probes: selectedProbes.length, failed })}\n`,
);
process.exitCode = failed > 0 ? 2 : 0;
