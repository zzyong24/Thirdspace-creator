import {sql,type Db,encryptSecret,decryptSecret} from "@creatoros/backend";
import {createHash} from "node:crypto";
import type {RequestContext} from "@creatoros/contract";
export const INTEGRATION_CREDENTIALS_DDL=`CREATE TABLE IF NOT EXISTS integration_credentials (user_id text NOT NULL, provider text NOT NULL, encrypted_secret text NOT NULL, updated_at text NOT NULL, PRIMARY KEY(user_id,provider));`;
export function createIntegrationCredentials(db:Db,masterKey:Buffer|null|undefined){
 const owner=(ctx:RequestContext)=>{if(!ctx.userId)throw Error("AUTH_REQUIRED");return ctx.userId;};
 const row=async(ctx:RequestContext)=>{const result=await db.execute(sql`select encrypted_secret,updated_at from integration_credentials where user_id=${owner(ctx)} and provider='redfox'`);return (result.rows as Array<{encrypted_secret:string;updated_at:string}>)[0];};
 return {
  async status(ctx:RequestContext){const r=await row(ctx);return {provider:"redfox" as const,configured:Boolean(r),updatedAt:r?.updated_at??null};},
  async save(ctx:RequestContext,key:string){if(!masterKey)throw Error("本机加密服务不可用，密钥未保存");const value=key.trim();if(!value||value.length>4096)throw Error("REDFOX_KEY_INVALID");const encrypted=encryptSecret(value,masterKey);await db.execute(sql`insert into integration_credentials(user_id,provider,encrypted_secret,updated_at) values(${owner(ctx)},'redfox',${encrypted},${new Date().toISOString()}) on conflict(user_id,provider) do update set encrypted_secret=excluded.encrypted_secret,updated_at=excluded.updated_at`);return this.status(ctx);},
  async remove(ctx:RequestContext){await db.execute(sql`delete from integration_credentials where user_id=${owner(ctx)} and provider='redfox'`);return this.status(ctx);},
  /** 仅Worker凭据端口调用，不得序列化为公共DTO或模型输入。 */
  async resolve(ctx:RequestContext){const r=await row(ctx);if(!r)return null;if(!masterKey)throw Error("REDFOX_KEY_UNAVAILABLE");let key:string;try{key=decryptSecret(r.encrypted_secret,masterKey);}catch{throw Error("REDFOX_KEY_UNAVAILABLE");}return {key,fingerprint:createHash("sha256").update(key).digest("hex")};},
 };
}
