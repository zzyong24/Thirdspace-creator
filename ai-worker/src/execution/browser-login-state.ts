import { z } from "zod";
const cookie = z
  .object({
    name: z.string(),
    value: z.string(),
    domain: z.string(),
    path: z.string(),
    expires: z.number().default(-1),
    httpOnly: z.boolean().default(false),
    secure: z.boolean().default(false),
    sameSite: z.enum(["Strict", "Lax", "None"]).default("Lax"),
    partitionKey: z.string().optional(),
  })
  .strict();
const origin = z
  .object({
    origin: z.string(),
    localStorage: z.array(
      z.object({ name: z.string(), value: z.string() }).strict(),
    ),
  })
  .strict();
const storage = z
  .object({ cookies: z.array(cookie), origins: z.array(origin) })
  .strict();
/** SEMANTIC_BOUNDARY_ALLOW: 仅按存储协议身份去重，冲突不推测哪个登录态更有效。宿主已独立验证每份状态的域归属。 */
export function mergeBrowserLoginStates(
  states: Array<string | null>,
): z.infer<typeof storage> {
  const cookies = new Map<string, z.infer<typeof cookie>>(),
    origins = new Map<string, z.infer<typeof origin>>();
  for (const raw of states) {
    if (raw === null) continue;
    if (Buffer.byteLength(raw, "utf8") > 2 * 1024 * 1024)
      throw new Error("BROWSER_LOGIN_STATE_INVALID");
    let parsed: z.infer<typeof storage>;
    try {
      parsed = storage.parse(JSON.parse(raw));
    } catch {
      throw new Error("BROWSER_LOGIN_STATE_INVALID");
    }
    for (const item of parsed.cookies) {
      const key = JSON.stringify([
        item.domain,
        item.path,
        item.name,
        item.partitionKey ?? null,
      ]);
      const prior = cookies.get(key);
      if (prior && JSON.stringify(prior) !== JSON.stringify(item))
        throw new Error("BROWSER_LOGIN_STATE_CONFLICT");
      cookies.set(key, item);
    }
    for (const item of parsed.origins) {
      const normalized = {
        ...item,
        localStorage: [...item.localStorage].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      };
      if (
        new Set(normalized.localStorage.map((row) => row.name)).size !==
        normalized.localStorage.length
      )
        throw new Error("BROWSER_LOGIN_STATE_CONFLICT");
      const prior = origins.get(item.origin);
      if (prior && JSON.stringify(prior) !== JSON.stringify(normalized))
        throw new Error("BROWSER_LOGIN_STATE_CONFLICT");
      origins.set(item.origin, normalized);
    }
  }
  return { cookies: [...cookies.values()], origins: [...origins.values()] };
}
