import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import { access, readFile, stat, unlink } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const CONNECTION_SCHEMA = "creatoros-cli-connection/v1";
export const CREDENTIAL_SCHEMA = "creatoros-cli-credential/v1";

export interface CreatorOsConnectionDescriptor {
  schema: typeof CONNECTION_SCHEMA;
  productId: string;
  packageId: string;
  protocolVersion: 1;
  pid: number;
  port: number;
  issuedAt: number;
  expiresAt: number;
  access: "full";
  credentialFile: string;
  launchNonceSha256: string;
}

interface CreatorOsCliCredential {
  schema: typeof CREDENTIAL_SCHEMA;
  productId: string;
  packageId: string;
  handshakeToken: string;
  cliAccessToken: string;
  launchNonce: string;
}

export interface CreatorOsConnection {
  descriptorPath: string;
  credentialPath: string;
  productId: string;
  packageId: string;
  protocolVersion: 1;
  pid: number;
  baseUrl: string;
  expiresAt: number;
  handshakeToken: string;
  cliAccessToken: string;
  launchNonce: string;
}

export class ConnectionError extends Error {
  constructor(
    public readonly code:
      | "CONNECTION_NOT_FOUND"
      | "CONNECTION_INVALID"
      | "CONNECTION_INSECURE"
      | "CONNECTION_EXPIRED"
      | "CONNECTION_STALE",
    message: string,
  ) {
    super(message);
    this.name = "ConnectionError";
  }
}

export interface ConnectionDiscoveryOptions {
  connectionFile?: string;
  productId?: string;
  now?: Date;
  processAlive?: (pid: number) => boolean;
}

export function defaultConnectionFile(productId = "creatoros"): string {
  const safeProductId = productId.replace(/[^a-zA-Z0-9._-]/g, "-");
  if (platform() === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "CreatorOS",
      safeProductId,
      "cli",
      "connection.json",
    );
  }
  if (platform() === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (!localAppData) {
      throw new ConnectionError(
        "CONNECTION_NOT_FOUND",
        "LOCALAPPDATA 未设置，无法发现 CreatorOS CLI 连接。",
      );
    }
    return join(localAppData, "CreatorOS", safeProductId, "cli", "connection.json");
  }
  return join(
    process.env.XDG_RUNTIME_DIR ?? join(homedir(), ".local", "state"),
    "creatoros",
    safeProductId,
    "cli",
    "connection.json",
  );
}

function parseJsonObject(raw: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ConnectionError("CONNECTION_INVALID", `${label} 不是合法 JSON。`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConnectionError("CONNECTION_INVALID", `${label} 必须是 JSON object。`);
  }
  return value as Record<string, unknown>;
}

async function assertCurrentUserOnly(filePath: string): Promise<void> {
  const info = await stat(filePath).catch(() => null);
  if (!info?.isFile()) {
    throw new ConnectionError("CONNECTION_NOT_FOUND", `未找到 ${filePath}`);
  }
  if (platform() !== "win32" && (info.mode & 0o077) !== 0) {
    throw new ConnectionError(
      "CONNECTION_INSECURE",
      `${filePath} 权限过宽，必须仅当前用户可读写。`,
    );
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function requireString(
  object: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = object[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConnectionError("CONNECTION_INVALID", `${label}.${key} 缺失。`);
  }
  return value;
}

export async function discoverConnection(
  options: ConnectionDiscoveryOptions = {},
): Promise<CreatorOsConnection> {
  const descriptorPath = resolve(
    options.connectionFile ??
      process.env.CREATOROS_CONNECTION_FILE ??
      defaultConnectionFile(options.productId ?? process.env.CREATOROS_PRODUCT_ID),
  );
  await access(descriptorPath, fsConstants.R_OK).catch(() => {
    throw new ConnectionError(
      "CONNECTION_NOT_FOUND",
      "没有可用的 CreatorOS CLI 连接。请先启动 CreatorOS，并在设置中开启本次启动的 CLI 完整访问。",
    );
  });
  await assertCurrentUserOnly(descriptorPath);
  const raw = parseJsonObject(await readFile(descriptorPath, "utf8"), "connection descriptor");
  if (raw.schema !== CONNECTION_SCHEMA || raw.protocolVersion !== 1) {
    throw new ConnectionError("CONNECTION_INVALID", "CreatorOS CLI 连接协议版本不兼容。");
  }
  const pid = raw.pid;
  const port = raw.port;
  if (!Number.isSafeInteger(pid) || Number(pid) <= 1) {
    throw new ConnectionError("CONNECTION_INVALID", "connection.pid 无效。");
  }
  if (!Number.isSafeInteger(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new ConnectionError("CONNECTION_INVALID", "connection.port 无效。");
  }
  if (raw.access !== "full") {
    throw new ConnectionError("CONNECTION_INVALID", "CreatorOS 尚未授予 CLI 完整访问。");
  }
  const expiresAt = raw.expiresAt;
  if (
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= (options.now ?? new Date()).getTime()
  ) {
    throw new ConnectionError("CONNECTION_EXPIRED", "CreatorOS CLI 连接已经过期，请重新开启。");
  }
  if (!(options.processAlive ?? isProcessAlive)(Number(pid))) {
    throw new ConnectionError("CONNECTION_STALE", "CreatorOS 进程已经退出，该 CLI 连接已失效。");
  }
  const expectedProduct = options.productId ?? process.env.CREATOROS_PRODUCT_ID;
  const productId = requireString(raw, "productId", "connection");
  if (expectedProduct && productId !== expectedProduct) {
    throw new ConnectionError(
      "CONNECTION_INVALID",
      `连接属于 ${productId}，不是请求的 ${expectedProduct}。`,
    );
  }
  const credentialRef = requireString(raw, "credentialFile", "connection");
  const credentialPath = isAbsolute(credentialRef)
    ? resolve(credentialRef)
    : resolve(dirname(descriptorPath), credentialRef);
  await assertCurrentUserOnly(credentialPath);
  const credential = parseJsonObject(
    await readFile(credentialPath, "utf8"),
    "CLI credential",
  );
  if (credential.schema !== CREDENTIAL_SCHEMA) {
    throw new ConnectionError("CONNECTION_INVALID", "CLI credential 协议版本不兼容。");
  }
  const packageId = requireString(raw, "packageId", "connection");
  const credentialProductId = requireString(credential, "productId", "credential");
  const credentialPackageId = requireString(credential, "packageId", "credential");
  const launchNonce = requireString(credential, "launchNonce", "credential");
  const launchNonceSha256 = requireString(raw, "launchNonceSha256", "connection");
  const actualNonceHash = createHash("sha256").update(launchNonce).digest("hex");
  if (
    credentialProductId !== productId ||
    credentialPackageId !== packageId ||
    actualNonceHash !== launchNonceSha256
  ) {
    throw new ConnectionError(
      "CONNECTION_INVALID",
      "CreatorOS CLI descriptor、包身份与本次启动 nonce 不匹配。",
    );
  }
  return {
    descriptorPath,
    credentialPath,
    productId,
    packageId,
    protocolVersion: 1,
    pid: Number(pid),
    baseUrl: `http://127.0.0.1:${Number(port)}`,
    expiresAt: Number(expiresAt),
    handshakeToken: requireString(credential, "handshakeToken", "credential"),
    cliAccessToken: requireString(credential, "cliAccessToken", "credential"),
    launchNonce,
  };
}

/** 当前 OS 用户主动撤销：先移除公开 descriptor 阻断新发现，再销毁秘密文件。 */
export async function revokeConnection(connection: CreatorOsConnection): Promise<void> {
  await unlink(connection.descriptorPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await unlink(connection.credentialPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}
