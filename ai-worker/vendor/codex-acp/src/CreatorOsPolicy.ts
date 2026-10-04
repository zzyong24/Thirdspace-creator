// CreatorOS 的宿主权限适配补丁；协议、原生会话和执行生命周期仍由上游实现。
import path from "node:path";

export const CREATOROS_ACP_POLICY = "creatoros-acp-readonly-v1";
export const CREATOROS_DISABLED_FEATURES = [
    "apps", "plugins", "hooks", "multi_agent", "multi_agent_v2", "browser_use", "computer_use",
    "code_mode", "code_mode_host", "tool_suggest", "shell_tool", "unified_exec", "view_image",
    "skill_search", "skill_mcp_dependency_install",
] as const;

type ObjectValue = Record<string, unknown>;
export interface CreatorOsPolicy {
    readonly codexPath: string;
    readonly config: ObjectValue;
    readonly startArgs: string[];
    readonly toolNames: string[];
    readonly disabledMcpNames: string[];
}

// SEMANTIC_BOUNDARY_ALLOW: 只核验固定权限、协议字段和宿主明确选择，不推断创作意图。
function unverified(): never {
    throw new Error("CODEX_CAPABILITY_UNVERIFIED");
}
function record(value: unknown): ObjectValue {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return unverified();
    return value as ObjectValue;
}
function json(value: string | undefined): unknown {
    if (value === undefined) return unverified();
    try { return JSON.parse(value); } catch { return unverified(); }
}
function names(value: unknown): string[] {
    if (!Array.isArray(value) || value.some(name => typeof name !== "string" || name.trim() === "")) return unverified();
    if (new Set(value).size !== value.length) return unverified();
    return value as string[];
}
function startupStrings(value: unknown): string[] {
    if (!Array.isArray(value) || value.some(arg => typeof arg !== "string" || arg === "")) return unverified();
    return value as string[];
}
function checkFixedConfig(config: ObjectValue): void {
    if (config.sandbox_mode !== "read-only" || config.approval_policy !== "on-request"
        || config.approvals_reviewer !== "user" || config.web_search !== "disabled") unverified();
    const features = record(config.features);
    for (const name of CREATOROS_DISABLED_FEATURES) if (features[name] !== false) unverified();
    if (features.image_generation !== true) unverified();
    const write = config.sandbox_workspace_write;
    if (write !== undefined && write !== null) {
        const roots = record(write).writable_roots;
        if (!Array.isArray(roots) || roots.length !== 0) unverified();
    }
}

export function readCreatorOsPolicy(env: NodeJS.ProcessEnv): CreatorOsPolicy | null {
    if (env.CREATOROS_ACP_POLICY === undefined) return null;
    if (env.CREATOROS_ACP_POLICY !== CREATOROS_ACP_POLICY || env.INITIAL_AGENT_MODE !== "read-only"
        || env.DEFAULT_AUTH_REQUEST !== undefined || env.MODEL_PROVIDER !== undefined) unverified();
    const codexPath = env.CODEX_PATH;
    if (!codexPath || (!path.isAbsolute(codexPath) && !path.win32.isAbsolute(codexPath))) unverified();
    const config = record(json(env.CODEX_CONFIG));
    checkFixedConfig(config);
    const configKeys = new Set(["sandbox_mode", "approval_policy", "approvals_reviewer", "web_search", "features", "mcp_servers"]);
    if (Object.keys(config).some(key => !configKeys.has(key))) unverified();
    const featureKeys = new Set<string>([...CREATOROS_DISABLED_FEATURES, "image_generation"]);
    if (Object.keys(record(config.features)).some(key => !featureKeys.has(key))) unverified();
    const servers = record(config.mcp_servers);
    for (const value of Object.values(servers)) {
        const server = record(value);
        if (server.enabled !== false || Object.keys(server).some(key => key !== "enabled")) unverified();
    }
    const policy: CreatorOsPolicy = {
        codexPath, config,
        startArgs: startupStrings(json(env.CREATOROS_CODEX_START_ARGS)),
        toolNames: names(json(env.CREATOROS_ACP_TOOL_NAMES)),
        disabledMcpNames: Object.keys(servers),
    };
    creatorOsStartupArguments(policy);
    return policy;
}

export function creatorOsStartupArguments(policy: CreatorOsPolicy): string[] {
    const argv = policy.startArgs;
    if (argv[0] !== "app-server" || argv[1] !== "--stdio" || (argv.length - 2) % 2 !== 0) unverified();
    const expected = new Set([
        'web_search="disabled"', 'sandbox_mode="read-only"', 'approval_policy="on-request"', 'approvals_reviewer="user"',
        ...CREATOROS_DISABLED_FEATURES.map(name => `features.${name}=false`), 'features.image_generation=true',
        ...(policy.disabledMcpNames.length === 0 ? [] : [`mcp_servers={${policy.disabledMcpNames.map(name => `${JSON.stringify(name)}={enabled=false}`).join(",")}}`]),
    ]);
    const seen = new Set<string>();
    for (let index = 2; index < argv.length; index += 2) {
        const value = argv[index + 1];
        if (argv[index] !== "-c" || typeof value !== "string" || !expected.has(value) || seen.has(value)) unverified();
        seen.add(value);
    }
    if (seen.size !== expected.size) unverified();
    return [...argv];
}

export function assertCreatorOsConfigResponse(policy: CreatorOsPolicy, response: unknown): void {
    const config = record(record(response).config);
    checkFixedConfig(config);
    const servers = record(config.mcp_servers);
    if (Object.keys(servers).length !== policy.disabledMcpNames.length) unverified();
    for (const name of policy.disabledMcpNames) if (record(servers[name]).enabled !== false) unverified();
}

export function assertCreatorOsThreadResponse(response: unknown, cwd: string): string {
    const result = record(response);
    const threadId = record(result.thread).id;
    const sandbox = record(result.sandbox);
    if (typeof threadId !== "string" || threadId.trim() === "" || result.cwd !== cwd
        || result.approvalPolicy !== "on-request" || result.approvalsReviewer !== "user"
        || sandbox.type !== "readOnly" || sandbox.networkAccess !== false) unverified();
    if (sandbox.writableRoots !== undefined && (!Array.isArray(sandbox.writableRoots) || sandbox.writableRoots.length !== 0)) unverified();
    return threadId;
}

export function assertCreatorOsPromptMode(policy: CreatorOsPolicy | null, mode: unknown, additionalDirectories: string[]): void {
    if (policy === null) return;
    const actual = record(mode);
    if (actual.id !== "read-only" || actual.approvalPolicy !== "on-request" || actual.approvalsReviewer !== "user"
        || additionalDirectories.length !== 0) unverified();
    const sandbox = record(actual.sandboxPolicy);
    if (sandbox.type !== "readOnly" || sandbox.networkAccess !== false) unverified();
}

export function mergeCreatorOsMcpConfig(policy: CreatorOsPolicy, requested: {name: string; config: ObjectValue}[]): ObjectValue {
    const seen = new Set(policy.disabledMcpNames);
    if (requested.length === 0 && policy.toolNames.length !== 0) unverified();
    for (const server of requested) {
        if (!server.name || seen.has(server.name)) unverified();
        seen.add(server.name);
    }
    return {...policy.config, mcp_servers: {
        ...record(policy.config.mcp_servers),
        ...Object.fromEntries(requested.map(server => [server.name, {...server.config, enabled: true}])),
    }};
}

type NativePolicyClient = {
    listMcpServerStatus(params: {threadId: string; detail: "toolsAndAuthOnly"; limit: number; cursor?: string}): Promise<unknown>;
};
export async function verifyCreatorOsThreadTools(client: NativePolicyClient, policy: CreatorOsPolicy, threadId: string, requestedNames: string[]): Promise<void> {
    const serverNames = new Set(requestedNames);
    const seenServers = new Set<string>();
    const actualTools = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
        const result = record(await client.listMcpServerStatus({threadId, detail:"toolsAndAuthOnly", limit:100,
            ...(cursor === undefined ? {} : {cursor})}));
        if (!Array.isArray(result.data)) unverified();
        for (const row of result.data) {
            const server = record(row);
            if (typeof server.name !== "string" || seenServers.has(server.name)) unverified();
            seenServers.add(server.name);
            if (policy.disabledMcpNames.includes(server.name)) {
                if (server.runtimeStatus !== "disabled") unverified();
                continue;
            }
            if (!serverNames.has(server.name) || server.runtimeStatus !== "connected"
                || server.pluginId !== null || server.toolsError !== null) unverified();
            for (const name of Object.keys(record(server.tools))) {
                if (!policy.toolNames.includes(name) || actualTools.has(name)) unverified();
                actualTools.add(name);
            }
        }
        if (result.nextCursor === null) {
            if (requestedNames.some(name => !seenServers.has(name)) || actualTools.size !== policy.toolNames.length) unverified();
            return;
        }
        if (typeof result.nextCursor !== "string" || result.nextCursor === "" || cursors.has(result.nextCursor)) unverified();
        cursors.add(result.nextCursor);
        cursor = result.nextCursor;
    }
    unverified();
}

export function creatorOsTurnMeta(meta: unknown, threadId: string, turn: unknown): ObjectValue {
    const original = meta !== null && typeof meta === "object" && !Array.isArray(meta) ? meta as ObjectValue : {};
    if (typeof threadId !== "string" || threadId.trim() === "" || turn === null || typeof turn !== "object") return original;
    const actual = turn as ObjectValue;
    if (typeof actual.id !== "string" || actual.id.trim() === ""
        || !["inProgress", "completed", "interrupted", "failed"].includes(actual.status as string)) return original;
    const creatoros = original.creatoros !== null && typeof original.creatoros === "object" && !Array.isArray(original.creatoros)
        ? original.creatoros as ObjectValue : {};
    return {...original, creatoros: {...creatoros, codex: {threadId, turnId:actual.id, status:actual.status}}};
}
