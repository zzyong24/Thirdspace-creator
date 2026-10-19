import type { SocialAccount } from "../types";

export function getAccountVariables(account?: SocialAccount): Record<string, string> {
  const values: Record<string, string> = { ...(account?.variables ?? {}) };
  const aliases: Array<[string, string | undefined]> = [
    ["博主名称", account?.name], ["账号名称", account?.name], ["作者名", account?.name],
    ["博主ID", account?.handle], ["账号ID", account?.handle], ["handle", account?.handle],
    ["博主简介", account?.signature], ["账号介绍", account?.signature], ["宣传语", account?.signature],
    ["头像", account?.avatarUrl], ["账号头像", account?.avatarUrl]
  ];
  for (const [key, value] of aliases) if (value?.trim()) values[key] = value.trim();
  return values;
}

export function replaceAccountVariables(source: string, account?: SocialAccount): string {
  const values = getAccountVariables(account);
  return source.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (placeholder, key: string) => values[key.trim()] || placeholder);
}
