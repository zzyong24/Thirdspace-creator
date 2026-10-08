import { readFile } from "node:fs/promises";
import {
  ENDPOINTS,
  CONTRACT_VERSION,
  getCliOperationPolicy,
  type CliOperationPolicy,
  type Endpoint,
} from "@creatoros/contract";
import { createCreatorOsMcpServer } from "./server";
import { DispatchClient, DispatchError, invocationReceipt, type DispatchInput } from "./dispatch";
import {
  ConnectionError,
  discoverConnection,
  revokeConnection,
} from "./connection";
import { endpointInputSchema, schemaToJson } from "./tools";
import {operationCatalog,describeOperation} from "./operation-catalog";
import { readDefaultAccountId, writeDefaultAccountId, readDefaultGroupId, writeDefaultGroupId } from "./context";
import { saveArtifactExport } from "./artifact-export";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

type JsonObject = Record<string, unknown>;

const endpointsById = new Map(
  (Object.values(ENDPOINTS) as Endpoint[]).map((endpoint) => [endpoint.id, endpoint]),
);

function flagValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少值。`);
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

const VALUE_FLAGS = new Set([
  "--input",
  "--account",
  "--group",
  "--idempotency-key",
  "--confirm-impact",
  "--connection-file",
  "--poll-interval",
  "--timeout",
  "--share",
  "--collection",
  "--domain","--effect","--offset","--limit",
  "--artifact",
  "--artifact-version",
  "--format",
  "--output",
]);
const BOOLEAN_FLAGS = new Set([
  "--json",
  "--apply",
  "--use-default-account",
  "--use-default-group",
  "--force-new",
  "--help",
  "--version",
  "--compact",
]);

function assertKnownFlags(args: string[]): void {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) continue;
    if (BOOLEAN_FLAGS.has(arg)) continue;
    if (!VALUE_FLAGS.has(arg)) throw new Error(`未知参数: ${arg}`);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} 缺少值。`);
    index += 1;
  }
}

function positional(args: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (VALUE_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith("--")) values.push(arg);
  }
  return values;
}

async function parseInput(raw: string | undefined): Promise<DispatchInput> {
  if (!raw) return {};
  const text = raw === "-"
    ? await new Promise<string>((resolve, reject) => {
        let value = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (value += chunk));
        process.stdin.on("end", () => resolve(value));
        process.stdin.on("error", reject);
      })
    : raw.startsWith("@")
      ? await readFile(raw.slice(1), "utf8")
      : raw;
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("--input 必须是 JSON object。");
  }
  return parsed as DispatchInput;
}

function operationMetadata(endpoint: Endpoint): JsonObject {
  return describeOperation(endpoint.id,endpointInputSchema,schemaToJson);
}

function requireExecutionFlags(
  operation: string,
  policy: CliOperationPolicy,
  args: string[],
): void {
  if (policy.effect === "read") return;
  if (!hasFlag(args, "--apply")) {
    throw new Error(`${operation} 是 ${policy.effect} 操作，必须显式使用 --apply。`);
  }
  if (!flagValue(args, "--idempotency-key")) {
    throw new Error(`${operation} 必须提供 --idempotency-key。`);
  }
  if (policy.confirmation === "confirm_impact" && !flagValue(args, "--confirm-impact")) {
    throw new Error(`${operation} 必须提供 --confirm-impact <target-or-reference>。`);
  }
}

function envelopeData(value: unknown): unknown {
  return value && typeof value === "object" && "data" in value
    ? (value as { data: unknown }).data
    : value;
}

function envelopeRequestId(value: unknown): string | null {
  const meta = envelopeMeta(value);
  if (!meta) return null;
  const requestId = meta.requestId;
  return typeof requestId === "string" ? requestId : null;
}

function envelopeMeta(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object") return null;
  const meta = (value as { meta?: unknown }).meta;
  if (!meta || typeof meta !== "object") return null;
  return meta as JsonObject;
}

function envelopeReceiptFields(value: unknown) {
  const receipt = invocationReceipt(value);
  return receipt ? { receipt, requestId: receipt.requestId, meta: { ...envelopeMeta(value), requestId: receipt.requestId } } : {};
}

async function selectedAccountId(args: string[]): Promise<string | undefined> {
  const explicit = flagValue(args, "--account");
  if (explicit) return explicit;
  // 保存的默认号只给人工连续操作；自动化不显式选择就让 backend 的 account-required 门拒绝。
  return hasFlag(args, "--use-default-account")
    ? (await readDefaultAccountId()) ?? undefined
    : undefined;
}

async function selectedGroupId(args: string[]): Promise<string | undefined> {
  const explicit = flagValue(args, "--group");
  if (explicit) return explicit;
  if (hasFlag(args, "--use-default-group")) {
    const saved = await readDefaultGroupId();
    if (!saved) throw new Error("尚未保存默认账号组，请先执行 groups use <groupId>。");
    return saved;
  }
  return undefined;
}

const TASK_READERS = [
  { operation: "ai.tasks.get", input: (taskId: string) => ({ params: { taskId } }) },
  { operation: "execution.tasks.get", input: (taskId: string) => ({ params: { taskId } }) },
  { operation: "intelligence.runs.get", input: (runId: string) => ({ params: { runId } }) },
  { operation: "ingestion.runs.get", input: (runId: string) => ({ params: { runId } }) },
  { operation: "jobRuns.get", input: (runId: string) => ({ params: { runId } }) },
] as const;

async function readTask(
  client: DispatchClient,
  taskId: string,
  accountId: string | undefined,
  groupId?: string,
): Promise<{ sourceOperation: string; requestId: string | null; task: unknown }> {
  for (const reader of TASK_READERS) {
    try {
      const envelope = await client.dispatch(
        reader.operation,
        reader.input(taskId),
        { accountId, groupId },
      );
      return {
        sourceOperation: reader.operation,
        requestId: envelopeRequestId(envelope),
        task: envelopeData(envelope),
      };
    } catch (error) {
      if (error instanceof DispatchError && error.status === 404) continue;
      throw error;
    }
  }
  throw new DispatchError(404, "tasks.get", `task not found: ${taskId}`);
}

function taskStatus(task: unknown): string | null {
  if (!task || typeof task !== "object") return null;
  const status = (task as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

const NON_TERMINAL_TASK_STATUSES = new Set([
  "pending",
  "queued",
  "running",
  "pause_requested",
  "cancel_requested",
]);

function positiveNumberFlag(args: string[], name: string): number | null {
  const raw = flagValue(args, name);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} 必须是正数秒。`);
  return value;
}

async function waitForTask(
  client: DispatchClient,
  taskId: string,
  accountId: string | undefined,
  args: string[],
  groupId?: string,
): Promise<{ sourceOperation: string; requestId: string | null; task: unknown }> {
  const pollSeconds = positiveNumberFlag(args, "--poll-interval") ?? 2;
  const timeoutSeconds = positiveNumberFlag(args, "--timeout");
  if (timeoutSeconds !== null && timeoutSeconds < 120) {
    throw new Error("--timeout 最短为 120 秒；省略表示持续观察，等待结束不会取消后台任务。");
  }
  const startedAt = Date.now();
  while (true) {
    const current = await readTask(client, taskId, accountId, groupId);
    const status = taskStatus(current.task);
    if (status && !NON_TERMINAL_TASK_STATUSES.has(status)) return current;
    if (timeoutSeconds !== null && Date.now() - startedAt >= timeoutSeconds * 1000) {
      throw new Error(`等待任务 ${taskId} 超过 ${timeoutSeconds} 秒；后台任务没有被取消。`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }
}

async function clientFor(args: string[]): Promise<{
  client: DispatchClient;
  connection: Awaited<ReturnType<typeof discoverConnection>> | null;
}> {
  const explicitDevBaseUrl = process.env.CREATOROS_BASE_URL;
  if (explicitDevBaseUrl) {
    return {
      connection: null,
      client: new DispatchClient({
        baseUrl: explicitDevBaseUrl,
        email: process.env.CREATOROS_EMAIL,
        password: process.env.CREATOROS_PASSWORD,
        handshakeToken: process.env.CREATOROS_HANDSHAKE_TOKEN,
        cliAccessToken: process.env.CREATOROS_CLI_ACCESS_TOKEN,
      }),
    };
  }
  const connection = await discoverConnection({
    connectionFile: flagValue(args, "--connection-file"),
  });
  return {
    connection,
    client: new DispatchClient({
      baseUrl: connection.baseUrl,
      handshakeToken: connection.handshakeToken,
      cliAccessToken: connection.cliAccessToken,
      productId: connection.productId,
      packageId: connection.packageId,
      launchNonce: connection.launchNonce,
    }),
  };
}


interface McpLifecycleEvents {
  once(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}
interface McpLifecycleServer<Transport> {
  connect(transport: Transport): Promise<void>;
  close(): Promise<void>;
}

/**
 * Adapted from dream-num/workbuddy-univer-office src/mcp/main.ts, Apache-2.0,
 * commit 856eae4fe416b28adffb96092d67ff26c7797ff4. Source/license record:
 * scripts/workbuddy/SOURCE.md. Close only this MCP connection, never backend tasks.
 */
export async function serveMcpStdio<Transport>(
  server: McpLifecycleServer<Transport>,
  transport: Transport,
  input: McpLifecycleEvents = process.stdin,
  signals: McpLifecycleEvents = process,
): Promise<void> {
  let closing: Promise<void> | undefined;
  let finish!: () => void;
  let fail!: (error: unknown) => void;
  const done = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  const detach = () => {
    input.removeListener("end", onClose);
    signals.removeListener("SIGINT", onClose);
    signals.removeListener("SIGTERM", onClose);
  };
  const close = () => closing ??= Promise.resolve().then(() => server.close());
  const onClose = () => {
    detach();
    void close().then(finish, fail);
  };
  input.once("end", onClose);
  signals.once("SIGINT", onClose);
  signals.once("SIGTERM", onClose);
  try {
    // EOF or a signal must also release a transport still starting up.
    await Promise.race([server.connect(transport), done]);
    await done;
  } catch (error) {
    detach();
    // A failed connection still owns local resources. Preserve the original failure.
    await close().catch(() => undefined);
    throw error;
  } finally {
    detach();
  }
}
const ARTIFACT_EXPORT_USAGE = "artifacts export <taskId> --artifact <artifactId> --artifact-version <positiveInt> --format raw|preview|png|pdf --output <localPath> --account <id>";

export async function runCliCommand(args: string[]): Promise<unknown> {
  assertKnownFlags(args);
  const [group, action, target] = positional(args);
  if (group === "help" || hasFlag(args, "--help")) {
    return {
      ok: true,
      usage: `creatoros status | access status|revoke | operations list|describe <op> | call <op> --input <json|@file|-> [--group <id>|--use-default-group] [--account <id>|--use-default-account] | tasks get|wait <taskId> --group <id> [--account <id>] | ${ARTIFACT_EXPORT_USAGE} | accounts list|current|use <id> | groups list|current|use <id> | douyin status|login|refresh|import | mcp serve`,
      artifactExport: "通过 workbench.artifacts.render 只读导出；显式 --output 无需 --apply，已有文件不会覆盖。filename 仅作建议展示。",
      taskWaitFlags: "tasks wait <taskId>：--timeout 最短 120 秒，省略表示持续观察；--poll-interval 是轮询间隔。等待结束不取消后台任务，应继续观察原 taskId。",

      writeFlags: "--apply --idempotency-key <key>",
      impactFlags: "--confirm-impact <真实账号或实体ID>",
    };
  }
  if (hasFlag(args, "--version")) {
    return { ok: true, cliVersion: "0.1.0", contractVersion: CONTRACT_VERSION };
  }
  if (group === "operations" && action === "list") {
    const compact=hasFlag(args,"--compact"),domain=flagValue(args,"--domain"),effect=flagValue(args,"--effect"),offset=flagValue(args,"--offset"),limit=flagValue(args,"--limit");
    if(compact||domain!==undefined||effect!==undefined||offset!==undefined||limit!==undefined){
      const page=operationCatalog({...(domain!==undefined?{domain}:{}),...(effect!==undefined?{effect}:{}),...(offset!==undefined?{offset:Number(offset)}:{}),...(limit!==undefined?{limit:Number(limit)}:{})});
      return {ok:true,count:page.rows.length,total:page.total,offset:page.offset,limit:page.limit,hasMore:page.hasMore,nextOffset:page.nextOffset,operations:compact?page.rows:page.rows.map(row=>operationMetadata(endpointsById.get(row.operation)!))};
    }
    return {
      ok: true,
      count: endpointsById.size,
      operations: [...endpointsById.values()]
        // SEMANTIC_BOUNDARY_ALLOW: 只按 ASCII 操作 ID 稳定排序协议目录，不作内容或创作判断。
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        .map(operationMetadata),
    };
  }
  if (group === "operations" && action === "describe") {
    const endpoint = target ? endpointsById.get(target) : undefined;
    if (!endpoint) throw new Error(`未知 operation: ${target ?? "(missing)"}`);
    return { ok: true, ...operationMetadata(endpoint) };
  }
  if (group === "status") {
    const { connection } = await clientFor(args);
    return {
      ok: true,
      mode: connection ? "installed" : "explicit-dev",
      connected: true,
      access: connection ? "full" : "developer_override",
      productId: connection?.productId ?? "dev",
      packageId: connection?.packageId ?? null,
      pid: connection?.pid ?? null,
      expiresAt: connection?.expiresAt ?? null,
    };
  }
  if (group === "access" && action === "status") {
    const { connection } = await clientFor(args);
    return {
      ok: true,
      enabled: connection !== null,
      access: connection ? "full" : "developer_override",
      productId: connection?.productId ?? "dev",
      expiresAt: connection?.expiresAt ?? null,
    };
  }
  if (group === "access" && action === "revoke") {
    const { connection } = await clientFor(args);
    if (!connection) throw new Error("显式开发模式不能通过 CLI 撤销，请移除开发环境变量。");
    await revokeConnection(connection);
    return { ok: true, enabled: false, revoked: true };
  }
  if (group === "groups" && action === "current") {
    return {ok:true, groupId:await readDefaultGroupId()};
  }
  if (group === "groups" && action === "list") {
    const {client}=await clientFor(args);
    const envelope=await client.dispatch("accountGroups.list", {query:{}});
    return {ok:true,operation:"accountGroups.list",data:envelopeData(envelope),meta:envelopeMeta(envelope),...envelopeReceiptFields(envelope)};
  }
  if (group === "groups" && action === "use") {
    if (!target) throw new Error("groups use 缺少 groupId。");
    const {client}=await clientFor(args);
    await client.dispatch("accountGroups.get", {params:{groupId:target}}, {groupId:target});
    await writeDefaultGroupId(target);
    return {ok:true,groupId:target};
  }
  if (group === "accounts" && action === "current") {
    return { ok: true, accountId: await readDefaultAccountId() };
  }
  if (group === "accounts" && action === "list") {
    const { client } = await clientFor(args);
    const envelope = await client.dispatch("accounts.list", { query: {} });
    return {
      ok: true,
      operation: "accounts.list",
      requestId: envelopeRequestId(envelope),
      accountId: null,
      data: envelopeData(envelope),
      meta: envelopeMeta(envelope),
      ...envelopeReceiptFields(envelope),
      error: null,
    };
  }
  if (group === "accounts" && action === "use") {
    if (!target) throw new Error("accounts use 缺少 accountId。");
    const { client } = await clientFor(args);
    await client.dispatch(
      "accounts.get",
      { params: { accountId: target } },
      { accountId: target },
    );
    await writeDefaultAccountId(target);
    return { ok: true, accountId: target };
  }
  if (group === "douyin" && action === "status") {
    const accountId = await selectedAccountId(args);
    const groupId = await selectedGroupId(args);
    if (!accountId) throw new Error("douyin status 必须显式 --account <accountId>。");
    const { client } = await clientFor(args);
    const envelope = await client.dispatch(
      "ingestion.douyin.status",
      { query: { accountId } },
      { accountId, groupId },
    );
    return {
      ok: true,
      operation: "ingestion.douyin.status",
      requestId: envelopeRequestId(envelope),
      accountId,
      groupId: groupId ?? null,
      data: envelopeData(envelope),
      meta: envelopeMeta(envelope),
      ...envelopeReceiptFields(envelope),
      error: null,
    };
  }
  if (group === "douyin" && action === "login") {
    const operation = "ingestion.douyin.login";
    const policy = getCliOperationPolicy(operation)!;
    requireExecutionFlags(operation, policy, args);
    const accountId = await selectedAccountId(args);
    const groupId = await selectedGroupId(args);
    const { client } = await clientFor(args);
    const envelope = await client.dispatch(
      operation,
      { body: { ...(accountId ? { accountId } : {}), forceNew: hasFlag(args, "--force-new") } },
      {
        accountId,
        groupId,
        idempotencyKey: flagValue(args, "--idempotency-key"),
        apply: true,
        confirmImpact: flagValue(args, "--confirm-impact"),
      },
    );
    return {
      ok: true,
      operation,
      requestId: envelopeRequestId(envelope),
      groupId: groupId ?? null,
      accountId: accountId ?? null,
      data: envelopeData(envelope),
      meta: envelopeMeta(envelope),
      ...envelopeReceiptFields(envelope),
      error: null,
    };
  }
  if (group === "douyin" && action === "import") {
    const operation = "intelligence.items.importDouyinShare";
    const policy = getCliOperationPolicy(operation)!;
    requireExecutionFlags(operation, policy, args);
    const accountId = await selectedAccountId(args);
    const groupId = await selectedGroupId(args);
    if (!accountId) throw new Error("douyin import 必须显式 --account <accountId>。");
    const shareInput = flagValue(args, "--share");
    if (!shareInput) throw new Error("douyin import 必须提供 --share <抖音分享链接或分享文本>。");
    const idempotencyKey = flagValue(args, "--idempotency-key")!;
    const { client } = await clientFor(args);
    const envelope = await client.dispatch(
      operation,
      {
        body: {
          accountId,
          collectionId: flagValue(args, "--collection") ?? null,
          shareInput,
          idempotencyKey,
        },
      },
      {
        accountId,
        groupId,
        idempotencyKey,
        apply: true,
        confirmImpact: flagValue(args, "--confirm-impact"),
      },
    );
    return {
      ok: true,
      operation,
      requestId: envelopeRequestId(envelope),
      accountId,
      groupId: groupId ?? null,
      data: envelopeData(envelope),
      meta: envelopeMeta(envelope),
      ...envelopeReceiptFields(envelope),
      error: null,
    };
  }
  if (group === "douyin" && action === "refresh") {
    const operation = "scheduledJobs.runNow";
    const policy = getCliOperationPolicy(operation)!;
    requireExecutionFlags(operation, policy, args);
    const accountId = await selectedAccountId(args);
    const groupId = await selectedGroupId(args);
    if (!accountId) throw new Error("douyin refresh 必须显式 --account <accountId>。");
    const { client } = await clientFor(args);
    const listed = await client.dispatch(
      "scheduledJobs.list",
      { query: { page: 1, pageSize: 100, sourceKind: "self.detail" } },
      { accountId, groupId },
    );
    const jobs = envelopeData(listed);
    if (!Array.isArray(jobs) || jobs.length !== 1) {
      throw new Error(
        jobs && Array.isArray(jobs) && jobs.length > 1
          ? `账号 ${accountId} 存在多个“我的作品指标”采集任务，拒绝猜测目标。`
          : `账号 ${accountId} 尚无“我的作品指标”采集任务，请先完成抖音绑定。`,
      );
    }
    const jobId = (jobs[0] as { id?: unknown }).id;
    if (typeof jobId !== "string" || !jobId) throw new Error("采集任务缺少真实 jobId。");
    const envelope = await client.dispatch(
      operation,
      { params: { jobId }, body: {} },
      {
        accountId,
        groupId,
        idempotencyKey: flagValue(args, "--idempotency-key"),
        apply: true,
        confirmImpact: flagValue(args, "--confirm-impact"),
      },
    );
    return {
      ok: true,
      operation,
      sourceOperation: "scheduledJobs.list",
      requestId: envelopeRequestId(envelope),
      accountId,
      groupId: groupId ?? null,
      data: envelopeData(envelope),
      meta: envelopeMeta(envelope),
      ...envelopeReceiptFields(envelope),
      error: null,
    };
  }
  if (group === "artifacts" && action === "export") {
    if (!target) throw new Error("artifacts export 缺少 taskId。");
    const requiredFlag = (name: string): string => {
      const value = flagValue(args, name);
      if (!value?.trim()) throw new Error(`artifacts export 必须显式提供 ${name}。`);
      return value;
    };
    const artifactId = requiredFlag("--artifact");
    const rawVersion = requiredFlag("--artifact-version");
    const version = Number(rawVersion);
    if (!/^\d+$/.test(rawVersion) || !Number.isSafeInteger(version) || version <= 0) {
      throw new Error("--artifact-version 必须是安全范围内的正整数。");
    }
    const format = requiredFlag("--format");
    if (!["raw", "preview", "png", "pdf"].includes(format)) {
      throw new Error("--format 必须是 raw、preview、png 或 pdf。");
    }
    const output = requiredFlag("--output");
    const accountId = requiredFlag("--account");
    const operation = "workbench.artifacts.render";
    const { client } = await clientFor(args);
    const envelope = await client.dispatch(
      operation,
      { params: { taskId: target, artifactId, version }, query: { format } },
      { accountId },
    );
    const data = await saveArtifactExport(envelopeData(envelope), format, output);
    return {
      ok: true,
      operation,
      requestId: envelopeRequestId(envelope),
      accountId,
      data,
      meta: envelopeMeta(envelope),
      error: null,
    };
  }
  if (group === "call") {
    const endpoint = action ? endpointsById.get(action) : undefined;
    if (!endpoint) throw new Error(`未知 operation: ${action ?? "(missing)"}`);
    const policy = getCliOperationPolicy(endpoint.id);
    if (!policy) throw new Error(`operation 缺 CLI policy: ${endpoint.id}`);
    requireExecutionFlags(endpoint.id, policy, args);
    const { client } = await clientFor(args);
    const input = await parseInput(flagValue(args, "--input"));
    const accountId = await selectedAccountId(args);
    const groupId = await selectedGroupId(args);
    const envelope = await client.dispatch(action, input, {
      accountId,
      groupId,
      idempotencyKey: flagValue(args, "--idempotency-key"),
      apply: hasFlag(args, "--apply"),
      confirmImpact: flagValue(args, "--confirm-impact"),
    });
    return {
      ok: true,
      operation: action,
      requestId: envelopeRequestId(envelope),
      groupId: groupId ?? null,
      accountId: accountId ?? null,
      data: envelopeData(envelope),
      meta: envelopeMeta(envelope),
      ...envelopeReceiptFields(envelope),
      error: null,
    };
  }
  if (group === "tasks" && (action === "get" || action === "wait")) {
    if (!target) throw new Error(`tasks ${action} 缺少 taskId。`);
    const { client } = await clientFor(args);
    const accountId = await selectedAccountId(args);
    const groupId = await selectedGroupId(args);
    const result = action === "wait"
      ? await waitForTask(client, target, accountId, args, groupId)
      : await readTask(client, target, accountId, groupId);
    return {
      ok: true,
      operation: `tasks.${action}`,
      sourceOperation: result.sourceOperation,
      requestId: result.requestId,
      groupId: groupId ?? null,
      accountId: accountId ?? null,
      data: result.task,
      error: null,
    };
  }
  if (group === "mcp" && action === "serve") {
    const { client } = await clientFor(args);
    const server = createCreatorOsMcpServer({ dispatchClient: client,defaultGroupId:await selectedGroupId(args),defaultAccountId:await selectedAccountId(args) });
    await serveMcpStdio(server, new StdioServerTransport());
    return undefined;
  }
  throw new Error(
    `用法: creatoros status | access status|revoke | operations list|describe <op> | call <op> --input <json|@file|-> [--group <id>|--use-default-group] [--account <id>|--use-default-account] | tasks get|wait <taskId> --group <id> [--account <id>] | ${ARTIFACT_EXPORT_USAGE} | accounts list|current|use <id> | groups list|current|use <id> | douyin status|login|refresh|import | mcp serve`,
  );
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  try {
    const result = await runCliCommand(args);
    if (result !== undefined) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof ConnectionError
      ? error.code
      : error instanceof DispatchError
        ? `HTTP_${error.status}`
        : "CLI_ERROR";
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message }, ...(error instanceof DispatchError ? envelopeReceiptFields(error) : {}) }, null, 2)}\n`);
    process.exitCode = error instanceof ConnectionError ? 3 : error instanceof DispatchError ? 4 : 2;
  }
}
