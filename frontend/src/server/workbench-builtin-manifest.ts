import type { WorkbenchCapability } from "@creatoros/contract/agent-workbench";

type Platform = WorkbenchCapability["platforms"][number];
type Effect = WorkbenchCapability["effects"][number];
type Tool = { name: string; effect: Effect };
type Builtin = {
  id: string;
  version: string;
  platforms: readonly Platform[];
  capability: string;
  dependencies: readonly { id: string; version: string }[];
  tools: readonly Tool[];
};

/** 与随应用打包的 Pi/NomiFun 来源锁一致；第三方目录不参与自动发现。 */
export const workbenchDependencyLock = {
  piCodingAgent: "0.80.7",
  nomifunCommit: "e27bd5de9a58ce444032ef4e63bb753992555c4c",
  nomifunVersion: "0.7.2",
} as const;

export const workbenchBuiltins: readonly Builtin[] = [
  {
    id: "creatoros.task-files", version: "1", platforms: ["macos", "windows"], capability: "task.files",
    dependencies: [{ id: "pi-coding-agent", version: workbenchDependencyLock.piCodingAgent }],
    tools: ["list", "read", "stat", "write", "edit"].map(name => ({ name: `files.${name}`, effect: ["write", "edit"].includes(name) ? "task_write" : "read" })),
  },
  {
    id: "creatoros.task-command", version: "1", platforms: ["macos"], capability: "task.command",
    dependencies: [{ id: "pi-coding-agent", version: workbenchDependencyLock.piCodingAgent }],
    tools: [
      { name: "execution.run", effect: "process" }, { name: "execution.status", effect: "read" },
      { name: "execution.cancel", effect: "process" }, { name: "execution.read", effect: "read" },
    ],
  },
  {
    id: "creatoros.browser", version: "1", platforms: ["macos"], capability: "task.browser",
    dependencies: [
      { id: "pi-coding-agent", version: workbenchDependencyLock.piCodingAgent },
      { id: "nomifun", version: workbenchDependencyLock.nomifunCommit },
    ],
    tools: [
      { name: "browser.open", effect: "process" }, { name: "browser.status", effect: "read" },
      { name: "browser.navigate", effect: "read" }, { name: "browser.observe", effect: "read" },
      { name: "browser.extract", effect: "read" }, { name: "browser.act", effect: "external_write" },
      { name: "browser.close", effect: "process" },
    ],
  },
  {
    id: "creatoros.artifacts", version: "1", platforms: ["macos", "windows"], capability: "task.artifacts",
    dependencies: [{ id: "pi-coding-agent", version: workbenchDependencyLock.piCodingAgent }],
    tools: [{ name: "artifact.register", effect: "task_write" }, { name: "artifact.read", effect: "read" }],
  },
];

/** 只向模型公布已审查、当前平台实际装配且契约相符的宿主工具。 */
export function selectBuiltinWorkbenchCapabilities(host?: {
  catalog: readonly WorkbenchCapability[];
  platform: Platform;
  capabilities: readonly string[];
  dispatch: Function;
}): WorkbenchCapability[] {
  if (!host || typeof host.dispatch !== "function") return [];
  const allowed = new Map<string, { capability: string; effect: Effect }>();
  for (const builtin of workbenchBuiltins) {
    if (!builtin.platforms.includes(host.platform) || !host.capabilities.includes(builtin.capability)) continue;
    for (const tool of builtin.tools) allowed.set(tool.name, { capability: builtin.capability, effect: tool.effect });
  }
  const counts = new Map<string, number>();
  for (const item of host.catalog) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
  return host.catalog.filter(item => {
    const rule = allowed.get(item.name);
    return rule !== undefined && counts.get(item.name) === 1 && item.schemaVersion === 1 &&
      item.platforms.includes(host.platform) && item.requiredCapabilities.length === 1 &&
      item.requiredCapabilities[0] === rule.capability && item.effects.length === 1 &&
      item.effects[0] === rule.effect;
  }).map(item => structuredClone(item));
}
