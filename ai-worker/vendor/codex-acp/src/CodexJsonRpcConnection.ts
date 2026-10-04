import * as rpc from "vscode-jsonrpc/node";
import type {MessageConnection} from "vscode-jsonrpc/node";
import type {ChildProcessWithoutNullStreams} from "node:child_process";
import {spawn} from "node:child_process";
import {createRequire} from "node:module";

import {createJSONRPCReader, createJSONRPCWriter} from "./StdUtils";
import {logger} from "./Logger";
import {readCreatorOsPolicy, creatorOsStartupArguments} from "./CreatorOsPolicy";
export {readCreatorOsPolicy, creatorOsStartupArguments, assertCreatorOsConfigResponse, assertCreatorOsThreadResponse, creatorOsTurnMeta} from "./CreatorOsPolicy";

export interface CodexConnection {
    readonly connection: MessageConnection
    readonly process: ChildProcessWithoutNullStreams;
}

export function startCodexConnection(codexPath?: string, env?: NodeJS.ProcessEnv): CodexConnection {
    const spawnEnv = env ?? process.env;
    const policy = readCreatorOsPolicy(spawnEnv);
    if (policy !== null && codexPath !== policy.codexPath) throw new Error("CODEX_CAPABILITY_UNVERIFIED");
    const args = policy === null ? ['app-server'] : creatorOsStartupArguments(policy);

    let codex: ChildProcessWithoutNullStreams;
    if (codexPath) {
        codex = spawn(codexPath, args, {shell: false, env: spawnEnv});
    } else {
        const bundledCodexPath = createRequire(typeof __filename === "string" ? __filename : import.meta.url).resolve("@openai/codex/bin/codex.js");
        codex = spawn(process.execPath, [bundledCodexPath, 'app-server'], {env: spawnEnv});
    }

    attachLogs(codex);

    const reader = createJSONRPCReader(codex.stdout);
    const writer = createJSONRPCWriter(codex.stdin);

    let connection = rpc.createMessageConnection(reader, writer);

    connection.listen();

    // Terminate all current activities on process termination
    codex.on("exit", _ => {
        connection.dispose();
    });

    return {connection: connection, process: codex};
}

function attachLogs(proc: ChildProcessWithoutNullStreams) {
    // 不记录 JSON-RPC 内容或原始 stderr：其中可能含会话内容和 MCP 凭据。
    proc.stderr.on("data", () => {});
    proc.on("exit", (code) => {
        logger.log(`[EXIT] code: ${code?.toString()}`);
    });
}
