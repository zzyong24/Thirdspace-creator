import {sql,type Db,encryptSecret,decryptSecret} from "@creatoros/backend";
import {createHash} from "node:crypto";
import { ErrorCode, type RequestContext } from "@creatoros/contract";
import {
  defaultEveryInfraHost,
  everyInfraHostSchema,
  type EveryInfraCredentials,
  type EveryInfraHost,
} from "@creatoros/contract/internal/everyinfra";
function invalidEveryInfraSetting(message: string) {
  return Object.assign(new Error(message), { code: ErrorCode.ValidationError });
}

export const INTEGRATION_CREDENTIALS_DDL=`CREATE TABLE IF NOT EXISTS integration_credentials (user_id text NOT NULL, provider text NOT NULL, encrypted_secret text NOT NULL, updated_at text NOT NULL, options jsonb NOT NULL DEFAULT '{}'::jsonb, PRIMARY KEY(user_id,provider));`;
export function createIntegrationCredentials(db:Db,masterKey:Buffer|null|undefined){
 const owner=(ctx:RequestContext)=>{if(!ctx.userId)throw Error("AUTH_REQUIRED");return ctx.userId;};
 const row=async(ctx:RequestContext)=>{const result=await db.execute(sql`select encrypted_secret,updated_at from integration_credentials where user_id=${owner(ctx)} and provider='redfox'`);return (result.rows as Array<{encrypted_secret:string;updated_at:string}>)[0];};
  async function everyInfraRow(ctx: RequestContext) {
    const result = await db.execute(sql`
      select encrypted_secret, updated_at, options
      from integration_credentials
      where user_id = ${owner(ctx)} and provider = 'everyinfra'
    `);
    return (result.rows as Array<{
      encrypted_secret: string;
      updated_at: string;
      options: { baseUrl?: unknown } | null;
    }>)[0];
  }

  function everyInfraHost(options: { baseUrl?: unknown } | null | undefined): EveryInfraHost {
    const host = everyInfraHostSchema.safeParse(options?.baseUrl ?? defaultEveryInfraHost);
    if (!host.success) throw invalidEveryInfraSetting("万有引擎主机配置无效");
    return host.data;
  }

  async function statusEveryInfra(ctx: RequestContext) {
    const existing = await everyInfraRow(ctx);
    return {
      provider: "everyinfra" as const,
      configured: Boolean(existing),
      updatedAt: existing?.updated_at ?? null,
      baseUrl: everyInfraHost(existing?.options),
    };
  }

 return {
  statusEveryInfra,
  async saveEveryInfra(ctx: RequestContext, input: { secret?: string; baseUrl: EveryInfraHost }) {
    const baseUrl = everyInfraHost(input);
    const options = JSON.stringify({ baseUrl });
    const updatedAt = new Date().toISOString();
    if (input.secret !== undefined) {
      const secret = input.secret.trim();
      if (!secret || secret.length > 4096) throw invalidEveryInfraSetting("万有引擎密钥格式无效");
      if (!masterKey) throw new Error("本机加密服务不可用，密钥未保存");
      const encrypted = encryptSecret(secret, masterKey);
      await db.execute(sql`
        insert into integration_credentials(user_id, provider, encrypted_secret, updated_at, options)
        values (${owner(ctx)}, 'everyinfra', ${encrypted}, ${updatedAt}, ${options}::jsonb)
        on conflict (user_id, provider) do update set
          encrypted_secret = excluded.encrypted_secret, updated_at = excluded.updated_at, options = excluded.options
      `);
    } else {
      const result = await db.execute(sql`
        update integration_credentials set options = ${options}::jsonb, updated_at = ${updatedAt}
        where user_id = ${owner(ctx)} and provider = 'everyinfra' returning user_id
      `);
      if (!result.rows.length) throw invalidEveryInfraSetting("请填写万有引擎 API Key");
    }
    return statusEveryInfra(ctx);
  },
  async removeEveryInfra(ctx: RequestContext) {
    await db.execute(sql`delete from integration_credentials where user_id = ${owner(ctx)} and provider = 'everyinfra'`);
    return statusEveryInfra(ctx);
  },
  /** 仅供受信任的服务端和 Worker 凭据端口调用。 */
  async resolveEveryInfra(ctx: RequestContext): Promise<EveryInfraCredentials | null> {
    const existing = await everyInfraRow(ctx);
    if (!existing || !masterKey) return null;
    let apiKey: string;
    try {
      apiKey = decryptSecret(existing.encrypted_secret, masterKey);
    } catch {
      return null;
    }
    return { apiKey, baseUrl: everyInfraHost(existing.options) };
  },
  async status(ctx:RequestContext){const r=await row(ctx);return {provider:"redfox" as const,configured:Boolean(r),updatedAt:r?.updated_at??null};},
  async save(ctx:RequestContext,key:string){if(!masterKey)throw Error("本机加密服务不可用，密钥未保存");const value=key.trim();if(!value||value.length>4096)throw Error("REDFOX_KEY_INVALID");const encrypted=encryptSecret(value,masterKey);await db.execute(sql`insert into integration_credentials(user_id,provider,encrypted_secret,updated_at) values(${owner(ctx)},'redfox',${encrypted},${new Date().toISOString()}) on conflict(user_id,provider) do update set encrypted_secret=excluded.encrypted_secret,updated_at=excluded.updated_at`);return this.status(ctx);},
  async remove(ctx:RequestContext){await db.execute(sql`delete from integration_credentials where user_id=${owner(ctx)} and provider='redfox'`);return this.status(ctx);},
  /** 仅Worker凭据端口调用，不得序列化为公共DTO或模型输入。 */
  async resolve(ctx:RequestContext){const r=await row(ctx);if(!r)return null;if(!masterKey)throw Error("REDFOX_KEY_UNAVAILABLE");let key:string;try{key=decryptSecret(r.encrypted_secret,masterKey);}catch{throw Error("REDFOX_KEY_UNAVAILABLE");}return {key,fingerprint:createHash("sha256").update(key).digest("hex")};},
 };
}
