import { z } from "zod";
import { parse as parseDomain } from "tldts";
import { assertSafeWebDomain } from "@creatoros/ai-worker/browser/web-domain";
export interface BrowserAuthorization {
    allowedDomains: string[];
    allowInteraction: boolean;
}
export type BrowserAuthorizedAction = "observe" | "navigate" | "click" | "fill" | "wait" | "extract";
export class BrowserAuthorizationError extends Error {
    readonly code = "BROWSER_AUTHORIZATION_REQUIRED";
    constructor() { super("浏览器操作不在用户已授权的网站或交互范围内"); this.name = "BrowserAuthorizationError"; }
}
const inputSchema = z.object({ allowedDomains: z.array(z.string().max(253)).min(1).max(30), allowInteraction: z.boolean() }).strict();
/** 用户任务创建参数的JSON契约；公共域名与精确范围还由下方运行时验证。 */
export const browserAuthorizationJsonSchema = { type: "object", additionalProperties: false, required: ["allowedDomains", "allowInteraction"], properties: { allowedDomains: { type: "array", minItems: 1, maxItems: 30, items: { type: "string", format: "hostname", maxLength: 253 }, description: "用户允许访问的公共网站主机名，逐个精确授权，不含URL、端口或通配符" }, allowInteraction: { type: "boolean", description: "用户是否授权在上述网站执行点击和填写" } } } as const;
function publicHost(raw: string): string {
    const host = assertSafeWebDomain(raw);
    if (host.split(".").some(label => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)))
        throw new BrowserAuthorizationError();
    const parsed = parseDomain(host, { allowPrivateDomains: true });
    if (parsed.isIp || !parsed.domain || (!parsed.isIcann && !parsed.isPrivate) || new URL(`https://${host}`).hostname !== host)
        throw new BrowserAuthorizationError();
    return host;
}
function normalize(raw: unknown): BrowserAuthorization {
    try {
        const parsed = inputSchema.parse(raw);
        return { allowedDomains: [...new Set(parsed.allowedDomains.map(publicHost))], allowInteraction: parsed.allowInteraction };
    }
    catch {
        throw new BrowserAuthorizationError();
    }
}
/** 只用于用户创建任务的inputData；不得把模型工具参数传到该入口以提升权限。 */
export function prepareBrowserAuthorization(inputData: Record<string, unknown>): BrowserAuthorization | null {
    if (inputData.browserAuthorization === undefined)
        return null;
    return normalize(inputData.browserAuthorization);
}
/** 不做DNS解析；运行时必须继续对每次请求及跳转执行既有URL guard。
 * SEMANTIC_BOUNDARY_ALLOW: 仅验证用户明确选择的域与动作权限，不推断按钮含义或任务意图。 */
export function assertBrowserAuthorization(frozen: BrowserAuthorization | null, url: string, action: BrowserAuthorizedAction): void {
    try {
        if (!frozen || !["observe", "navigate", "click", "fill", "wait", "extract"].includes(action))
            throw new BrowserAuthorizationError();
        const authorization = normalize(frozen), target = new URL(url);
        if (!["http:", "https:"].includes(target.protocol) || target.username || target.password)
            throw new BrowserAuthorizationError();
        const host = publicHost(target.hostname);
        if (!authorization.allowedDomains.includes(host) || ((action === "click" || action === "fill") && !authorization.allowInteraction))
            throw new BrowserAuthorizationError();
    }
    catch {
        throw new BrowserAuthorizationError();
    }
}
