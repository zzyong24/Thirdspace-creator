-- T1209 / SEMANTIC_BOUNDARY_ALLOW: 仅补已证明初始归属的旧计划冻结版本，不选择内容、不授新身份。
-- 不重签ai_tasks/execution_tasks/job_run，也不覆盖已有错误版本或任何转组历史。
DO $migration$
BEGIN
 LOOP
  BEGIN
   LOCK TABLE public.platform_accounts, public.account_group_memberships, public.account_groups IN SHARE MODE NOWAIT;
   LOCK TABLE public.scheduled_job IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   -- NOWAIT避免与account→member→group→job的业务锁顺序交错后持半套锁等待。
   PERFORM a.id FROM public.platform_accounts a ORDER BY a.id FOR SHARE OF a NOWAIT;
   PERFORM m.id FROM public.account_group_memberships m ORDER BY m.id FOR SHARE OF m NOWAIT;
   PERFORM g.id FROM public.account_groups g ORDER BY g.id FOR SHARE OF g NOWAIT;
   PERFORM j.id FROM public.scheduled_job j WHERE j.membership_version IS NULL ORDER BY j.id FOR UPDATE OF j NOWAIT;

   UPDATE public.scheduled_job j
   SET group_version=COALESCE(j.group_version,g.version),membership_version=m.version
   FROM public.platform_accounts a
   JOIN public.account_group_memberships m ON m.platform_account_id=a.id AND m.user_id=a.user_id
   JOIN public.account_groups g ON g.id=m.group_id AND g.user_id=a.user_id
   WHERE j.user_id=a.user_id AND j.account_id=a.id AND j.group_id=g.id
    AND g.id='grp_legacy_'||a.id AND m.left_at IS NULL AND m.version=1
    AND j.membership_version IS NULL AND (j.group_version IS NULL OR j.group_version=g.version)
    AND NOT EXISTS(SELECT 1 FROM public.account_group_memberships h WHERE h.platform_account_id=a.id AND h.id<>m.id);
   EXIT;
  EXCEPTION WHEN lock_not_available THEN
   -- 本轮锁和写入全部回滚，下一轮重新读取当前真实成员和完整历史。
   NULL;
  END;
  PERFORM pg_sleep(0.05);
 END LOOP;
END $migration$;
