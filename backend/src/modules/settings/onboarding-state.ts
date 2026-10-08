import {lockWorkspaceMembership} from "../platform-account/membership-lock.service";
import { AuthenticationError, OwnershipError, sql, type Db } from "@creatoros/backend";
import { ENDPOINTS, onboardingPatchResource, onboardingStateResource, type OnboardingPatch, type OnboardingStateResource, type RequestContext } from "@creatoros/contract";

/** 通过账号服务验证归属，不跨模块读账号表。 */
export type OnboardingAccountReader = (ctx: RequestContext, accountId: string) => Promise<unknown>;
export type OnboardingGroupReader=(ctx:RequestContext,groupId:string)=>Promise<unknown>;
type GroupState=typeof ENDPOINTS.getGroupOnboarding.response["_output"];
export function createOnboardingState(db: Db, readAccount: OnboardingAccountReader,readGroup?:OnboardingGroupReader) {
  async function authorize(ctx: RequestContext, accountId: string) {
    if (!ctx.userId) throw new AuthenticationError();
    if (!accountId || ctx.accountId !== accountId) throw new OwnershipError();
    await readAccount(ctx, accountId);
  }
  function decode(row: Record<string, unknown>): OnboardingStateResource {
    return onboardingStateResource.parse({accountId:row.account_id,origin:row.origin,hidden:row.hidden,collapsed:row.collapsed,completedSteps:row.completed_steps,updatedAt:row.updated_at});
  }
  async function authorizeGroup(ctx:RequestContext,groupId:string){
    if(!ctx.userId)throw new AuthenticationError();
    if(!groupId||ctx.groupId!==groupId)throw new OwnershipError();
    if(!readGroup)throw Error("GROUP_ONBOARDING_READER_UNAVAILABLE");
    await readGroup({...ctx,accountId:null},groupId);
  }
  function decodeGroup(row:Record<string,unknown>):GroupState{return ENDPOINTS.getGroupOnboarding.response.parse({groupId:row.group_id,accountId:null,origin:row.origin,hidden:row.hidden,collapsed:row.collapsed,completedSteps:row.completed_steps,updatedAt:row.updated_at});}
  return {
    async getGroup(ctx:RequestContext,groupId:string):Promise<GroupState>{
      await authorizeGroup(ctx,groupId);const result=await db.execute(sql`SELECT * FROM group_onboarding_states WHERE user_id=${ctx.userId} AND group_id=${groupId}`);const row=(result.rows as Record<string,unknown>[])[0];
      return row?decodeGroup(row):{groupId,accountId:null,origin:null,hidden:false,collapsed:true,completedSteps:[],updatedAt:null};
    },
    async patchGroup(ctx:RequestContext,groupId:string,input:OnboardingPatch):Promise<GroupState>{
      const patch=onboardingPatchResource.parse(input);await authorizeGroup(ctx,groupId);
      return db.transaction(async tx=>{
        // 与归档/成员变更共用真实组锁，读后不能跨组或给已归档工作区补写。
        await lockWorkspaceMembership(tx,{...ctx,accountId:null});
        const result=await tx.execute(sql`
          INSERT INTO group_onboarding_states(user_id,group_id,origin,hidden,collapsed,completed_steps,updated_at)
          VALUES(${ctx.userId},${groupId},${patch.origin??null},${patch.hidden??false},${patch.collapsed??true},${JSON.stringify([...new Set(patch.completedSteps??[])])}::jsonb,${new Date().toISOString()})
          ON CONFLICT(user_id,group_id) DO UPDATE SET
            origin=CASE WHEN ${patch.origin!==undefined} THEN excluded.origin ELSE group_onboarding_states.origin END,
            hidden=CASE WHEN ${patch.hidden!==undefined} THEN excluded.hidden ELSE group_onboarding_states.hidden END,
            collapsed=CASE WHEN ${patch.collapsed!==undefined} THEN excluded.collapsed ELSE group_onboarding_states.collapsed END,
            completed_steps=(SELECT COALESCE(jsonb_agg(step ORDER BY step),'[]'::jsonb) FROM (SELECT DISTINCT jsonb_array_elements_text(group_onboarding_states.completed_steps || excluded.completed_steps) AS step) merged),
            updated_at=excluded.updated_at RETURNING *`);
        return decodeGroup((result.rows as Record<string,unknown>[])[0]!);
      });
    },
    async get(ctx: RequestContext, accountId: string): Promise<OnboardingStateResource> {
      await authorize(ctx,accountId);
      const result=await db.execute(sql`SELECT * FROM onboarding_states WHERE user_id=${ctx.userId} AND account_id=${accountId}`);
      const row=(result.rows as Record<string,unknown>[])[0];
      return row ? decode(row) : {accountId,origin:null,hidden:false,collapsed:true,completedSteps:[],updatedAt:null};
    },
    async patch(ctx: RequestContext, accountId: string, input: OnboardingPatch): Promise<OnboardingStateResource> {
      const patch=onboardingPatchResource.parse(input);
      await authorize(ctx,accountId);
      // 单条UPSERT在行锁下并集合并里程碑；独立刷新不会覆盖偏好或丢掉另一请求的完成状态。
      const result=await db.execute(sql`
        INSERT INTO onboarding_states(user_id,account_id,origin,hidden,collapsed,completed_steps,updated_at)
        VALUES(${ctx.userId},${accountId},${patch.origin??null},${patch.hidden??false},${patch.collapsed??true},${JSON.stringify([...new Set(patch.completedSteps??[])])}::jsonb,${new Date().toISOString()})
        ON CONFLICT(user_id,account_id) DO UPDATE SET
          origin=CASE WHEN ${patch.origin!==undefined} THEN excluded.origin ELSE onboarding_states.origin END,
          hidden=CASE WHEN ${patch.hidden!==undefined} THEN excluded.hidden ELSE onboarding_states.hidden END,
          collapsed=CASE WHEN ${patch.collapsed!==undefined} THEN excluded.collapsed ELSE onboarding_states.collapsed END,
          completed_steps=(SELECT COALESCE(jsonb_agg(step ORDER BY step),'[]'::jsonb) FROM (SELECT DISTINCT jsonb_array_elements_text(onboarding_states.completed_steps || excluded.completed_steps) AS step) merged),
          updated_at=excluded.updated_at
        RETURNING *`);
      return decode((result.rows as Record<string,unknown>[])[0]!);
    },
  };
}
