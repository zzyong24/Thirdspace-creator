/**
 * T-501 PLAN RAT — no real network, no API key, no repository mutation.
 *
 * Uses the exact installed Vercel AI SDK provider packages with injected fetch
 * fixtures to prove that all three CreatorOS text protocols expose:
 *   1) a non-empty streamed text delta;
 *   2) a parsed client tool call;
 *   3) HTML 200 as an error/no-capability outcome;
 *   4) empty SSE as no-capability, even when HTTP succeeds.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, tool, type LanguageModel } from "ai";
import { z } from "zod";

type Protocol = "anthropic" | "openai_chat" | "openai_responses";
type FixtureMode = "text" | "tool" | "html" | "empty";

type ProbeResult = {
  protocol: Protocol;
  mode: FixtureMode;
  text: string;
  textDeltaCount: number;
  toolCallCount: number;
  errorCount: number;
  passed: boolean;
};

const encoder = new TextEncoder();

function sse(events: unknown[]): Response {
  const body = events
    .map((event) =>
      event === "[DONE]"
        ? "data: [DONE]\n\n"
        : `data: ${JSON.stringify(event)}\n\n`,
    )
    .join("");
  return new Response(encoder.encode(body), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function openAIChatEvents(mode: "text" | "tool"): unknown[] {
  const base = {
    id: "chatcmpl-rat",
    object: "chat.completion.chunk",
    created: 1,
    model: "fixture-model",
  };
  if (mode === "text") {
    return [
      { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "pong" }, finish_reason: null }] },
      { ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      "[DONE]",
    ];
  }
  return [
    {
      ...base,
      choices: [{
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [{
            index: 0,
            id: "call-rat",
            type: "function",
            function: { name: "probe", arguments: "{\"value\":\"ok\"}" },
          }],
        },
        finish_reason: null,
      }],
    },
    { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
    "[DONE]",
  ];
}

function openAIResponsesEvents(mode: "text" | "tool"): unknown[] {
  const created = {
    type: "response.created",
    response: {
      id: "resp-rat",
      created_at: 1,
      model: "fixture-model",
      service_tier: null,
    },
  };
  const completed = {
    type: "response.completed",
    response: {
      incomplete_details: null,
      usage: {
        input_tokens: 1,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 1,
        output_tokens_details: { reasoning_tokens: 0 },
      },
      service_tier: null,
    },
  };
  if (mode === "text") {
    return [
      created,
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "message", id: "msg-rat", phase: "final_answer" },
      },
      {
        type: "response.output_text.delta",
        item_id: "msg-rat",
        delta: "pong",
        logprobs: null,
      },
      {
        type: "response.output_item.done",
        output_index: 0,
        item: { type: "message", id: "msg-rat", phase: "final_answer" },
      },
      completed,
    ];
  }
  return [
    created,
    {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc-rat",
        call_id: "call-rat",
        name: "probe",
        arguments: "",
        namespace: null,
      },
    },
    {
      type: "response.function_call_arguments.delta",
      item_id: "fc-rat",
      output_index: 0,
      delta: "{\"value\":\"ok\"}",
    },
    {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        type: "function_call",
        id: "fc-rat",
        call_id: "call-rat",
        name: "probe",
        arguments: "{\"value\":\"ok\"}",
        status: "completed",
        namespace: null,
      },
    },
    completed,
  ];
}

function anthropicEvents(mode: "text" | "tool"): unknown[] {
  const start = {
    type: "message_start",
    message: {
      id: "msg-rat",
      model: "fixture-model",
      role: "assistant",
      usage: { input_tokens: 1 },
      content: [],
      stop_reason: null,
      container: null,
    },
  };
  const finish = [
    {
      type: "message_delta",
      delta: {
        stop_reason: mode === "tool" ? "tool_use" : "end_turn",
        stop_sequence: null,
        stop_details: null,
        container: null,
      },
      usage: { input_tokens: null, output_tokens: 1 },
      context_management: null,
    },
    { type: "message_stop" },
  ];
  if (mode === "text") {
    return [
      start,
      {
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      },
      {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "pong" },
      },
      { type: "content_block_stop", index: 0 },
      ...finish,
    ];
  }
  return [
    start,
    {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: "call-rat",
        name: "probe",
      },
    },
    {
      type: "content_block_delta",
      index: 0,
      delta: { type: "input_json_delta", partial_json: "{\"value\":\"ok\"}" },
    },
    { type: "content_block_stop", index: 0 },
    ...finish,
  ];
}

function fixtureFetch(protocol: Protocol, mode: FixtureMode): typeof fetch {
  return async () => {
    if (mode === "html") {
      return new Response("<html><body>marketing</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (mode === "empty") return sse([]);
    if (protocol === "anthropic") return sse(anthropicEvents(mode));
    if (protocol === "openai_responses") return sse(openAIResponsesEvents(mode));
    return sse(openAIChatEvents(mode));
  };
}

function modelForFixture(protocol: Protocol, mode: FixtureMode): LanguageModel {
  const injectedFetch = fixtureFetch(protocol, mode);
  if (protocol === "anthropic") {
    return createAnthropic({
      apiKey: "rat-not-a-secret",
      baseURL: "https://fixture.invalid/v1",
      fetch: injectedFetch,
    })("fixture-model");
  }
  if (protocol === "openai_responses") {
    return createOpenAI({
      apiKey: "rat-not-a-secret",
      baseURL: "https://fixture.invalid/v1",
      fetch: injectedFetch,
    }).responses("fixture-model");
  }
  return createOpenAICompatible({
    name: "rat",
    apiKey: "rat-not-a-secret",
    baseURL: "https://fixture.invalid/v1",
    fetch: injectedFetch,
  }).chatModel("fixture-model");
}

async function runProbe(protocol: Protocol, mode: FixtureMode): Promise<ProbeResult> {
  const result = streamText({
    model: modelForFixture(protocol, mode),
    prompt: mode === "tool" ? "Call probe." : "Return pong.",
    tools: mode === "tool"
      ? {
          probe: tool({
            description: "RAT probe",
            inputSchema: z.object({ value: z.string() }),
          }),
        }
      : undefined,
    toolChoice: mode === "tool" ? "required" : undefined,
    maxRetries: 0,
    onError: () => {},
  });

  let text = "";
  let textDeltaCount = 0;
  let toolCallCount = 0;
  let errorCount = 0;
  try {
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text;
        textDeltaCount += 1;
      } else if (part.type === "tool-call") {
        toolCallCount += 1;
      } else if (part.type === "error") {
        errorCount += 1;
      }
    }
  } catch {
    errorCount += 1;
  }

  const passed =
    mode === "text"
      ? text === "pong" && textDeltaCount > 0 && errorCount === 0
      : mode === "tool"
        ? toolCallCount > 0 && errorCount === 0
        : textDeltaCount === 0 && toolCallCount === 0;

  return {
    protocol,
    mode,
    text,
    textDeltaCount,
    toolCallCount,
    errorCount,
    passed,
  };
}

const protocols: Protocol[] = ["anthropic", "openai_chat", "openai_responses"];
const modes: FixtureMode[] = ["text", "tool", "html", "empty"];
const results: ProbeResult[] = [];
for (const protocol of protocols) {
  for (const mode of modes) results.push(await runProbe(protocol, mode));
}

const failed = results.filter((row) => !row.passed);
console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
if (failed.length > 0) process.exitCode = 1;
