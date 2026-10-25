import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("打包聊天在没有 node_modules 的中文目录完成真实 Pi 工具循环", async () => {
  const directory = mkdtempSync(join(tmpdir(), "CreatorOS 定位打包 "));
  const entry = fileURLToPath(new URL("./chat-pi-loop.ts", import.meta.url));
  const output = join(directory, "chat-worker.cjs");
  try {
    const bundle = await build({
      stdin: {
        resolveDir: process.cwd(),
        sourcefile: "positioning-packaged-smoke.ts",
        loader: "ts",
        contents: `
          import assert from "node:assert/strict";
          import { runChatPiLoop } from ${JSON.stringify(entry)};
          globalThis.fetch = async () => { throw Error("UNEXPECTED_NETWORK"); };
          const usage = {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          };
          let modelCalls = 0, toolCalls = 0;
          const model = {
            specificationVersion: "v4", provider: "fixture", modelId: "fixture", supportedUrls: {},
            doGenerate: async () => { throw Error("UNEXPECTED_GENERATE"); },
            doStream: async () => {
              modelCalls++;
              const first = modelCalls === 1;
              assert.ok(modelCalls <= 2);
              return { stream: new ReadableStream({ start(controller) {
                controller.enqueue({ type: "stream-start", warnings: [] });
                if (first) controller.enqueue({ type: "tool-call", toolCallId: "read-1", toolName: "read", input: "{}" });
                else {
                  controller.enqueue({ type: "text-start", id: "final" });
                  controller.enqueue({ type: "text-delta", id: "final", delta: "定位资料已读取。" });
                  controller.enqueue({ type: "text-end", id: "final" });
                }
                controller.enqueue({ type: "finish", usage, finishReason: { unified: first ? "tool-calls" : "stop", raw: first ? "tool-calls" : "stop" } });
                controller.close();
              } }) };
            },
          };
          runChatPiLoop({
            model, system: "按用户请求读取定位资料", messages: [{ role: "user", content: "读取资料" }],
            definitions: [{ name: "read", description: "读取合成资料", parameters: { type: "object", properties: {} } }],
            execute: async (name, _input, options) => {
              assert.equal(name, "read"); assert.equal(options.toolCallId, "read-1");
              toolCalls++; return { text: "合成定位资料" };
            },
            approve: async () => "approved", approvalId: () => "fixture-approval",
            signal: AbortSignal.timeout(120000), maxOutputTokens: 128, messageId: "packaged-positioning",
          }).then(result => {
            assert.equal(modelCalls, 2); assert.equal(toolCalls, 1);
            assert.equal(result.text, "定位资料已读取。");
            console.log(JSON.stringify({ text: result.text, modelCalls, toolCalls }));
          }).catch(error => { console.error(error.message); process.exitCode = 1; });
        `,
      },
      outfile: output,
      bundle: true,
      platform: "node",
      target: "node24",
      format: "cjs",
      metafile: true,
      logLevel: "silent",
    });
    expect(existsSync(join(directory, "node_modules"))).toBe(false);
    const stdout = execFileSync(process.execPath, [output], {
      cwd: directory,
      env: { ...process.env, NODE_PATH: "", CREATOROS_RUNTIME_ROOT: directory },
      encoding: "utf8",
      timeout: 120_000,
      windowsHide: true,
    });
    expect(JSON.parse(stdout.trim())).toEqual({ text: "定位资料已读取。", modelCalls: 2, toolCalls: 1 });
    const outputInputs = Object.values(bundle.metafile.outputs).flatMap(value => Object.entries(value.inputs));
    expect(outputInputs.some(([name, value]) => name.endsWith("pi-agent-core/dist/agent.js") && value.bytesInOutput > 0)).toBe(true);
    expect(outputInputs.some(([name, value]) => name.includes("pi-coding-agent/") && value.bytesInOutput > 0)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 300_000);
