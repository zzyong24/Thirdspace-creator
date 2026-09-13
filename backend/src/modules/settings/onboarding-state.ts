import { AuthenticationError, OwnershipError, sql, type Db } from "@creatoros/backend";
import { onboardingPatchResource, onboardingStateResource, type OnboardingPatch, type OnboardingStateResource, type RequestContext } from "@creatoros/contract";

/** 通过账号服务验证归属，不跨模块读账号表。 */
export type OnboardingAccountReader = (ctx: RequestContext, accountId: string) => Promise<unknown>;
export function createOnboardingState(db: Db, readAccount: OnboardingAccountReader) {
  async function authorize(ctx: RequestContext, accountId: string) {
    if (!ctx.userId) throw new AuthenticationError();
    if (!accountId || ctx.accountId !== accountId) throw new OwnershipError();
    await readAccount(ctx, accountId);
  }
  function decode(row: Record<string, unknown>): OnboardingStateResource {
    return onboardingStateResource.parse({accountId:row.account_id,origin:row.origin,hidden:row.hidden,collapsed:row.collapsed,completedSteps:row.completed_steps,updatedAt:row.updated_at});
  }
  return {
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
