-- T1089 / SEMANTIC_BOUNDARY_ALLOW: 仅凭真实账号、初始成员和完整父链盖章；不判断内容或新增authority。
-- 一轮的锁、函数、trigger和回填是同一个异常子事务。冲突回滚释放该轮锁后再重采。
DO $migration$
BEGIN
 LOOP
  BEGIN
   LOCK TABLE public.platform_accounts, public.account_group_memberships, public.account_groups IN SHARE MODE NOWAIT;
   LOCK TABLE public.projects, public.content_outputs, public.artifacts IN SHARE MODE NOWAIT;
   PERFORM g.id FROM public.account_groups g ORDER BY g.id FOR SHARE OF g NOWAIT;
   PERFORM p.id FROM public.projects p ORDER BY p.id FOR SHARE OF p NOWAIT;
   PERFORM o.id FROM public.content_outputs o ORDER BY o.id FOR SHARE OF o NOWAIT;
   PERFORM a.id FROM public.artifacts a ORDER BY a.id FOR SHARE OF a NOWAIT;
   LOCK TABLE public.ai_conversations, public.article_anchors, public.graphic_post_anchors IN SHARE ROW EXCLUSIVE MODE NOWAIT;
   -- 取得来源表锁前可能有新来源提交，全部重扫父行，不沿用上一轮候选或证明变量。
   PERFORM p.id FROM public.projects p ORDER BY p.id FOR SHARE OF p NOWAIT;
   PERFORM o.id FROM public.content_outputs o ORDER BY o.id FOR SHARE OF o NOWAIT;
   PERFORM a.id FROM public.artifacts a ORDER BY a.id FOR SHARE OF a NOWAIT;
   PERFORM c.id FROM public.ai_conversations c WHERE c.group_id IS NULL ORDER BY c.id FOR UPDATE OF c NOWAIT;
   PERFORM a.output_id FROM public.article_anchors a WHERE a.group_id IS NULL ORDER BY a.output_id FOR UPDATE OF a NOWAIT;
   PERFORM a.output_id FROM public.graphic_post_anchors a WHERE a.group_id IS NULL ORDER BY a.output_id FOR UPDATE OF a NOWAIT;

   CREATE FUNCTION public.creatoros_proven_initial_group(owner_id text, account_id text)
   RETURNS text LANGUAGE sql STABLE AS $initial$
    SELECT g.id
    FROM public.platform_accounts a
    JOIN public.account_group_memberships m ON m.platform_account_id=a.id AND m.user_id=a.user_id
    JOIN public.account_groups g ON g.id=m.group_id AND g.user_id=a.user_id
    WHERE a.id=$2 AND a.user_id=$1 AND a.status='active'
     AND m.left_at IS NULL AND m.version=1 AND g.status='active' AND g.id='grp_legacy_'||a.id
     AND NOT EXISTS(SELECT 1 FROM public.account_group_memberships h WHERE h.platform_account_id=a.id AND h.id<>m.id)
   $initial$;

   CREATE FUNCTION public.creatoros_proven_project_group(owner_id text, account_id text, project_id text)
   RETURNS text LANGUAGE sql STABLE AS $project$
    SELECT p.group_id FROM public.projects p
    WHERE p.id=$3 AND p.user_id=$1 AND p.account_id=$2
     AND p.group_id=public.creatoros_proven_initial_group($1,$2)
   $project$;

   CREATE FUNCTION public.creatoros_proven_anchor_group(owner_id text, account_id text, project_id text, output_id text, artifact_id text, output_type text, artifact_type text)
   RETURNS text LANGUAGE sql STABLE AS $anchor$
    SELECT p.group_id FROM public.projects p
    JOIN public.content_outputs o ON o.project_id=p.id AND o.id=$4 AND o.content_type=$6 AND o.group_id=p.group_id
    JOIN public.artifacts a ON a.id=$5 AND a.user_id=p.user_id AND a.account_id=p.account_id
     AND a.project_id=p.id AND a.content_output_id=o.id AND a.artifact_type=$7 AND a.group_id=p.group_id
    WHERE p.id=$3 AND p.user_id=$1 AND p.account_id=$2
     AND p.group_id=public.creatoros_proven_initial_group($1,$2)
   $anchor$;

   CREATE FUNCTION public.creatoros_stamp_legacy_source_group()
   RETURNS trigger LANGUAGE plpgsql AS $stamp$
   BEGIN
    IF NEW.group_id IS NOT NULL OR NEW.account_id IS NULL THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME='ai_conversations' THEN
     IF NEW.project_id IS NULL THEN NEW.group_id=public.creatoros_proven_initial_group(NEW.user_id,NEW.account_id);
     ELSE NEW.group_id=public.creatoros_proven_project_group(NEW.user_id,NEW.account_id,NEW.project_id); END IF;
    ELSIF TG_TABLE_NAME='article_anchors' THEN
     NEW.group_id=public.creatoros_proven_anchor_group(NEW.user_id,NEW.account_id,NEW.project_id,NEW.output_id,NEW.artifact_id,'article','wechat_article');
    ELSIF TG_TABLE_NAME='graphic_post_anchors' THEN
     NEW.group_id=public.creatoros_proven_anchor_group(NEW.user_id,NEW.account_id,NEW.project_id,NEW.output_id,NEW.artifact_id,'image','graphic_post');
    END IF;
    RETURN NEW;
   END $stamp$;

   UPDATE public.ai_conversations c SET group_id=CASE WHEN c.project_id IS NULL
    THEN public.creatoros_proven_initial_group(c.user_id,c.account_id)
    ELSE public.creatoros_proven_project_group(c.user_id,c.account_id,c.project_id) END
   WHERE c.group_id IS NULL AND c.account_id IS NOT NULL AND CASE WHEN c.project_id IS NULL
    THEN public.creatoros_proven_initial_group(c.user_id,c.account_id)
    ELSE public.creatoros_proven_project_group(c.user_id,c.account_id,c.project_id) END IS NOT NULL;
   UPDATE public.article_anchors a SET group_id=public.creatoros_proven_anchor_group(a.user_id,a.account_id,a.project_id,a.output_id,a.artifact_id,'article','wechat_article')
   WHERE a.group_id IS NULL AND a.account_id IS NOT NULL AND public.creatoros_proven_anchor_group(a.user_id,a.account_id,a.project_id,a.output_id,a.artifact_id,'article','wechat_article') IS NOT NULL;
   UPDATE public.graphic_post_anchors a SET group_id=public.creatoros_proven_anchor_group(a.user_id,a.account_id,a.project_id,a.output_id,a.artifact_id,'image','graphic_post')
   WHERE a.group_id IS NULL AND a.account_id IS NOT NULL AND public.creatoros_proven_anchor_group(a.user_id,a.account_id,a.project_id,a.output_id,a.artifact_id,'image','graphic_post') IS NOT NULL;
   CREATE TRIGGER legacy_source_group_stamp BEFORE INSERT ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.creatoros_stamp_legacy_source_group();
   CREATE TRIGGER legacy_source_group_stamp BEFORE INSERT ON public.article_anchors FOR EACH ROW EXECUTE FUNCTION public.creatoros_stamp_legacy_source_group();
   CREATE TRIGGER legacy_source_group_stamp BEFORE INSERT ON public.graphic_post_anchors FOR EACH ROW EXECUTE FUNCTION public.creatoros_stamp_legacy_source_group();
   EXIT;
  EXCEPTION WHEN lock_not_available THEN
   -- 此处块内取得的DDL/DML/表行锁已经回滚；不能在仍持半套锁时sleep。
   NULL;
  END;
  PERFORM pg_sleep(0.05);
 END LOOP;
END $migration$;
