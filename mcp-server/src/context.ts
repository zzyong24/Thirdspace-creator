import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultConnectionFile } from "./connection";

interface CliContextFile {
  schema: "creatoros-cli-context/v1";
  defaultAccountId?: string;
  defaultGroupId?: string;
}

export function defaultContextFile(productId?: string): string {
  return join(dirname(defaultConnectionFile(productId)), "context.json");
}

async function readContext(contextFile: string): Promise<Partial<CliContextFile>> {
  try { const value = JSON.parse(await readFile(contextFile, "utf8"));
    return value.schema === "creatoros-cli-context/v1" ? value : {};
  } catch { return {}; }
}
async function readSelection(key: "defaultAccountId" | "defaultGroupId", contextFile: string): Promise<string | null> {
  const value = (await readContext(contextFile))[key];
  return typeof value === "string" && value.trim() ? value : null;
}
export function readDefaultAccountId(contextFile = defaultContextFile(process.env.CREATOROS_PRODUCT_ID)): Promise<string | null> {
  return readSelection("defaultAccountId", contextFile);
}
export function readDefaultGroupId(contextFile = defaultContextFile(process.env.CREATOROS_PRODUCT_ID)): Promise<string | null> {
  return readSelection("defaultGroupId", contextFile);
}
async function writeSelection(key: "defaultAccountId" | "defaultGroupId", id: string, contextFile: string): Promise<void> {
  if (!id.trim()) throw new Error("默认上下文 ID 不能为空");
  const existing = await readContext(contextFile);
  const targetDir = dirname(contextFile);
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  const temp = join(targetDir, `.context-${randomUUID()}.tmp`);
  await writeFile(temp, `${JSON.stringify({schema:"creatoros-cli-context/v1", ...existing, [key]:id}, null, 2)}\n`, {encoding:"utf8",mode:0o600});
  await rename(temp, contextFile);
}
export function writeDefaultAccountId(accountId: string, contextFile = defaultContextFile(process.env.CREATOROS_PRODUCT_ID)): Promise<void> {
  return writeSelection("defaultAccountId", accountId, contextFile);
}
export function writeDefaultGroupId(groupId: string, contextFile = defaultContextFile(process.env.CREATOROS_PRODUCT_ID)): Promise<void> {
  return writeSelection("defaultGroupId", groupId, contextFile);
}
