import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ALL_CHAT_TOOL_NAMES, prepareChatAssembly } from "@creatoros/backend/modules/ai-runtime";
import { registerAllTemplates } from "@creatoros/ai-worker";
import { createChatMaterialTaskHost, type ChatMaterialTaskPorts } from "../../../backend/src/modules/ai-runtime/chat-material-task-host";
import { prepareChatToolDefinitions } from "../../../backend/src/modules/ai-runtime/chat-tool-definitions";

// [T-265 附:审计新发现②] functionKey ↔ ALL_CHAT_TOOL_NAMES 构建期不变量。
//
// 病例:前端深链带了不在 ALL_CHAT_TOOL_NAMES 的 functionKey,会被 chat-runner 静默丢弃。
//
// 前端深链必须指向真实工具，或经真实assembly解析并由原任务Host落实的显式媒体类型。
// 本测扫全部 src/ 生产源码(排除 .test.),抽出所有
// `functionKey: "..."` 字面量断言成员资格。新增 CTA 指向不存在工具 = 本测红,死链无法复发。

const SRC_DIR = resolve(process.cwd(), "src");

// 递归收集 src/ 下的 .ts/.tsx 生产源码(排除测试文件与类型声明)。
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
    out.push(full);
  }
  return out;
}

// 抽出源码里所有 `functionKey: "字面量"`(单/双引号)。
function extractFunctionKeys(source: string): string[] {
  const keys: string[] = [];
  const re = /functionKey:\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    keys.push(m[1]!);
  }
  return keys;
}

describe("[T-265] functionKey ↔ ALL_CHAT_TOOL_NAMES 不变量(死链防复发)", () => {
  beforeAll(() => registerAllTemplates());
  const files = collectSourceFiles(SRC_DIR);
  const toolNames = new Set(ALL_CHAT_TOOL_NAMES);

  // 收集全部 (文件, functionKey) 对,便于失败时精确定位是哪个 CTA 指向了不存在的工具。
  const occurrences: Array<{ file: string; key: string }> = [];
  for (const file of files) {
    for (const key of extractFunctionKeys(readFileSync(file, "utf8"))) {
      occurrences.push({ file, key });
    }
  }

  it("扫到至少一个 functionKey 字面量(否则正则失效 = 假绿)", () => {
    expect(occurrences.length).toBeGreaterThan(0);
    // T-730 已按用户确认恢复可选论点骨架；至少一个真实生产入口必须保留。
    expect(occurrences.some((o) => o.key === "planning.thesis")).toBe(true);
  });

  it("每个前端 functionKey 均可解析为真实工具；媒体快捷入口由原任务固定类型", async () => {
    const verifiedAliases = new Set<string>();
    for (const kind of ["image", "video"] as const) {
      const key = `material.generate.${kind}`;
      expect(occurrences.some(o => o.key === key)).toBe(true);
      expect(toolNames.has(key)).toBe(false);
      const context = { userId: "u", accountId: "a", requestId: "r", source: "user" as const };
      const chatContext = { surface: "project" as const, projectId: "project", functionKey: key };
      const assembly = await prepareChatAssembly(context, chatContext, {
        humanizeError: () => null,
        positioning: { getPositioningCenter: async () => ({ profile: null, currentStatement: null }) },
      }, null, { executionEngine: "codex", toolDefinitionOptions: { atomicMaterialGenerate: true } });
      expect(assembly.forcedTool).toBe("context.artifact.text");
      expect(assembly.forcedToolSequence).toEqual(["context.artifact.text", "material.generate"]);
      expect(assembly.forcedToolSequence?.every(name => toolNames.has(name) && assembly.tools[name])).toBe(true);
      const execution = { executionTaskId: "parent", attempt: 1, fenceToken: "f" };
      const definitions = (await prepareChatToolDefinitions(assembly.tools, { atomicMaterialGenerate: true })).definitions;
      const restored = { context, modelInput: { tools: definitions }, hostContext: { chatContext } };
      const read = vi.fn(async () => structuredClone(restored));
      const commit = vi.fn(), wakeTask = vi.fn(async () => {});
      const prepareTaskCommit = vi.fn<ChatMaterialTaskPorts["prepareTaskCommit"]>(async () => ({ commit }));
      const getArtifactText = vi.fn(async () => ({ artifactType: "output_script", fullText: "当前原文" }));
      const host = createChatMaterialTaskHost({ read } as never, { getArtifactText }, { prepareTaskCommit, wakeTask });
      const bound = await host(context, restored.modelInput as never, execution, new AbortController().signal);
      const prepared = await bound["material.generate"]!.prepareTask!(context, {
        kind: kind === "image" ? "video" : "image", prompt: "用户明确选择的画面",
      }, { execution, callId: "call", attemptId: "chat-submit:original-call" });
      expect(prepareTaskCommit).toHaveBeenCalledExactlyOnceWith(context, {
        taskType: "asset.generate", attemptId: "chat-submit:original-call",
        inputData: { kind, prompt: "用户明确选择的画面", projectId: "project", scriptSnapshot: { artifactType: "output_script", fullText: "当前原文" } },
      });
      expect(getArtifactText).toHaveBeenCalledExactlyOnceWith(context, { projectId: "project", artifactType: "output_script" });
      expect(prepared.result({ id: "child" } as never)).toMatchObject({ data: { kind: "material.generate", kindOf: kind, taskId: "child" } });
      expect(commit).not.toHaveBeenCalled(); expect(wakeTask).not.toHaveBeenCalled();
      verifiedAliases.add(key);
    }
    const dead = occurrences.filter((o) => !toolNames.has(o.key) && !verifiedAliases.has(o.key));
    const detail = dead
      .map((o) => `  ${o.key}  ← ${o.file.replace(process.cwd(), ".")}`)
      .join("\n");
    expect(
      dead,
      dead.length
        ? `以下 functionKey 不在 ALL_CHAT_TOOL_NAMES(死链,深链点了会空点/被别的工具冒充):\n${detail}`
        : "",
    ).toEqual([]);
  });
});
