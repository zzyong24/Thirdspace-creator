import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultConnectionFile } from "./connection";

interface CliContextFile {
  schema: "creatoros-cli-context/v1";
  defaultAccountId: string;
}

export function defaultContextFile(productId?: string): string {
  return join(dirname(defaultConnectionFile(productId)), "context.json");
}

export async function readDefaultAccountId(
  contextFile = defaultContextFile(process.env.CREATOROS_PRODUCT_ID),
): Promise<string | null> {
  try {
    const value = JSON.parse(await readFile(contextFile, "utf8")) as Partial<CliContextFile>;
    return value.schema === "creatoros-cli-context/v1" &&
      typeof value.defaultAccountId === "string" &&
      value.defaultAccountId.trim()
      ? value.defaultAccountId
      : null;
  } catch {
    return null;
  }
}

export async function writeDefaultAccountId(
  accountId: string,
  contextFile = defaultContextFile(process.env.CREATOROS_PRODUCT_ID),
): Promise<void> {
  const targetDir = dirname(contextFile);
  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  const temp = join(targetDir, `.context-${randomUUID()}.tmp`);
  await writeFile(
    temp,
    `${JSON.stringify(
      { schema: "creatoros-cli-context/v1", defaultAccountId: accountId },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  await rename(temp, contextFile);
}
