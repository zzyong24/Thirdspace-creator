import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { workbenchCapabilitySchema } from "@creatoros/contract/agent-workbench";
import { selectBuiltinWorkbenchCapabilities, workbenchBuiltins, workbenchDependencyLock } from "./workbench-builtin-manifest";

function descriptor(name: string, capability: string, effect: "read" | "task_write" | "process" | "external_write", platforms: ("macos" | "windows")[] = ["macos"]) {
  return workbenchCapabilitySchema.parse({name, schemaVersion: 1, description: name, inputSchema: {type:"object"},
    resultSchema:{type:"object"}, effects:[effect], requiredCapabilities:[capability], platforms});
}

it("锁定已打包的 Pi 和 NomiFun 来源版本，内置清单的工具名唯一", () => {
  const worker = JSON.parse(readFileSync(resolve(process.cwd(), "../ai-worker/package.json"), "utf8"));
  const source = readFileSync(resolve(process.cwd(), "src-tauri/vendor/nomifun/SOURCE.md"), "utf8");
  expect(worker.dependencies["@earendil-works/pi-coding-agent"]).toBe(workbenchDependencyLock.piCodingAgent);
  expect(source).toContain(workbenchDependencyLock.nomifunCommit);
  expect(source).toContain(workbenchDependencyLock.nomifunVersion);
  const names = workbenchBuiltins.flatMap(item => item.tools.map(tool => tool.name));
  expect(new Set(names).size).toBe(names.length);
});

it("仅公布宿主真实提供且平台、能力、效果和契约版本匹配的内置工具", () => {
  const files = descriptor("files.read", "task.files", "read", ["macos", "windows"]);
  const artifact = descriptor("artifact.read", "task.artifacts", "read", ["macos", "windows"]);
  const browser = descriptor("browser.open", "task.browser", "process");
  const screenshot = descriptor("browser.screenshot", "task.browser", "read");
  const unknown = descriptor("thirdparty.run", "task.files", "read");
  const host = {catalog:[files,artifact,browser,screenshot,unknown],platform:"windows" as const,capabilities:["task.files","task.artifacts","task.browser"],dispatch:()=>null};
  const selected = selectBuiltinWorkbenchCapabilities(host);
  expect(selected.map(item => item.name)).toEqual(["files.read","artifact.read"]);
  expect(selected[0]).not.toBe(files);
  expect(selectBuiltinWorkbenchCapabilities({...host,capabilities:[]})).toEqual([]);
  expect(selectBuiltinWorkbenchCapabilities({...host,dispatch:null as never})).toEqual([]);
  expect(selectBuiltinWorkbenchCapabilities({...host,platform:"macos"}).map(item=>item.name)).toEqual(["files.read","artifact.read","browser.open","browser.screenshot"]);
});

it("重复描述或效果漂移时不向模型公布该工具", () => {
  const valid = descriptor("artifact.read", "task.artifacts", "read");
  const host = {catalog:[valid,valid,descriptor("artifact.register","task.artifacts","read")],platform:"macos" as const,
    capabilities:["task.artifacts"],dispatch:()=>null};
  expect(selectBuiltinWorkbenchCapabilities(host)).toEqual([]);
});
