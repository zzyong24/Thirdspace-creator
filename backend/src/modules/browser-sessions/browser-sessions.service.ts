import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import { encryptSecret, decryptSecret, isEncrypted } from "@creatoros/backend";
import {
  createBrowserSessionsRepository,
  type BrowserSessionsRepository,
  type BrowserSessionRow,
} from "./browser-sessions.repository";

// [T-370a] Browser Sessions service —— web 域登录态(playwright storageState JSON)的加密
// 存取单一真值(SPEC 2026-07-17 browser-session-pool §3.1)。**host 内部用**(web-session /
// browser-pool 经 persistence-client 注入端口),不建契约 op、不暴露 API。
//
// 硬规则(gate F-3,与模型 key 的「向后兼容明文降级」刻意相反 —— cookie 是完整会话劫持材料):
//   · 写侧:master-key 缺失 / 加密失败 → 抛 BrowserSessionCryptoError(人话,引导先解决
//     keychain),**绝不明文落库**;
//   · 读侧:行存在但**非密文**(异常态,本 service 从不写明文)或解密失败(换机器/换 key)
//     → console.warn + 返 null(视为未登录,复用 settings「视为未配置」降级思想;绝不把
//     可疑内容当登录态注入浏览器)。
//
// scope:本期只 'web-domain'(SPEC §2.1 抖音红线:抖音登录态不进本表)。user 级域名维
// (ctx.userId stamp,无 account_id)。

export const WEB_DOMAIN_SCOPE = "web-domain";

/** master-key 不可用 / 加密失败 —— 人话错,route/调用方原样渲给用户。 */
export class BrowserSessionCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserSessionCryptoError";
  }
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  /**
   * 32B master key(同 settings 模型 key 的 resolveMasterKey 来源:桌面 keychain 经 env
   * 注入 / dev 降级 key)。**缺省 = 不可用 = 拒存**(不同于 settings repo 的明文兼容路径)。
   */
  masterKey?: Buffer;
}

type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export interface BrowserSessionsService {
  getStateVersioned(ctx:RequestContext,domain:string,transaction?:Transaction):Promise<{stateJson:string|null;revision:string|null}>;
  saveStateVersioned(ctx:RequestContext,domain:string,stateJson:string,expectedRevision:string|null,transaction?:Transaction,signal?:AbortSignal):Promise<{saved:boolean;revision:string|null}>;
  /** 加密保存某域 storageState JSON(upsert)。master-key 缺失/加密失败 → 抛人话错拒存。 */
  saveState(ctx: RequestContext, domain: string, stateJson: string): Promise<void>;
  /** 读某域 storageState JSON(解密)。无记录 / 非密文 / 解密失败 → null(视为未登录)。 */
  getState(ctx: RequestContext, domain: string): Promise<string | null>;
  /** 删某域登录态(登出/移除保管库会话)。 */
  removeState(ctx: RequestContext, domain: string): Promise<boolean>;
  /** 列已存登录态的域名(+更新时间)。不解密。 */
  listDomains(
    ctx: RequestContext,
  ): Promise<Array<{ domain: string; updatedAt: string }>>;
}

export function createBrowserSessionsService(
  deps: ServiceDeps,
): BrowserSessionsService {
  const repoFor = (ctx: RequestContext,transaction?:Transaction): BrowserSessionsRepository =>
    createBrowserSessionsRepository(transaction as unknown as Db ?? deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
    });

  const revision = (row:BrowserSessionRow|null) => row ? createHash("sha256").update(JSON.stringify([row.id,row.stateEncrypted])).digest("hex") : null;
  function encrypt(stateJson:string):string {
    const key = deps.masterKey;
    if (!key) {
      // gate F-3:绝不明文落库 —— 没 key 就拒存,人话引导先解决 keychain。
      throw new BrowserSessionCryptoError(
        "登录态没有保存:本机加密密钥(master key)不可用,拒绝明文保存网站登录态。" +
        "请先解决系统钥匙串/CREATOROS_MASTER_KEY 配置后重新登录一次。",
      );
    }
    let encrypted: string;
    try {
      encrypted = encryptSecret(stateJson, key);
    } catch (err) {
      throw new BrowserSessionCryptoError(
        `登录态没有保存:加密失败(${err instanceof Error ? err.message : String(err)})。` +
        "拒绝明文保存网站登录态,请解决加密配置后重新登录一次。",
      );
    }
    return encrypted;
  }
  function decrypt(row:BrowserSessionRow|null,domain:string):string|null {
    if(!row)return null;
    // 异常态:非密文(本 service 从不写明文;手改/迁移残留)→ 不信任,视为未登录。
    if (!isEncrypted(row.stateEncrypted)) {
      console.warn(
        `[browser-sessions] ${domain} 的登录态记录不是密文(异常),视为未登录。`,
      );
      return null;
    }
    const key = deps.masterKey;
    if (!key) {
      console.warn(
        `[browser-sessions] master key 不可用,无法解密 ${domain} 登录态,视为未登录。`,
      );
      return null;
    }
    try {
      return decryptSecret(row.stateEncrypted, key);
    } catch (err) {
      // 换机器/换 key/数据损坏 → auth tag 校验失败。视为未登录(用户重登一次即自愈),logged。
      console.warn(
        `[browser-sessions] 解密 ${domain} 登录态失败(视为未登录,需重新登录):`,
        err instanceof Error ? err.message : String(err),
      );
      return null;
    }
  }
  return {
    saveState: async (ctx,domain,stateJson) => {await repoFor(ctx).upsertState(WEB_DOMAIN_SCOPE,domain,encrypt(stateJson));},
    getState: async (ctx,domain) => decrypt(await repoFor(ctx).getState(WEB_DOMAIN_SCOPE,domain),domain),
    getStateVersioned: async (ctx,domain,transaction) => {
      const row=await repoFor(ctx,transaction).getState(WEB_DOMAIN_SCOPE,domain);
      return {stateJson:decrypt(row,domain),revision:revision(row)};
    },
    saveStateVersioned: async (ctx,domain,stateJson,expectedRevision,transaction,signal) => {
      signal?.throwIfAborted();
      const repo=repoFor(ctx,transaction), row=await repo.getState(WEB_DOMAIN_SCOPE,domain);
      signal?.throwIfAborted();
      if(revision(row)!==expectedRevision)return {saved:false,revision:revision(row)};
      const result=await repo.compareAndSetState(WEB_DOMAIN_SCOPE,domain,encrypt(stateJson),row);
      // 在调用方事务中，迟到停止必须抛出并回滚 CAS；非事务写已提交则返回真实事实。
      if(transaction)signal?.throwIfAborted();
      return {saved:result.saved,revision:revision(result.row)};
    },

    removeState: async (ctx, domain) =>
      repoFor(ctx).deleteState(WEB_DOMAIN_SCOPE, domain),

    listDomains: async (ctx) => {
      const rows = await repoFor(ctx).listScopeKeys(WEB_DOMAIN_SCOPE);
      return rows.map((r) => ({ domain: r.scopeKey, updatedAt: r.updatedAt }));
    },
  };
}
