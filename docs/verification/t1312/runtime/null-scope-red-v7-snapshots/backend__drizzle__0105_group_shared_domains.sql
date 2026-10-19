-- T-1022：共享创作根按账号组；旧 account_id 仅保留来源兼容，平台事实身份不改。
DO $$ DECLARE name TEXT; BEGIN
 FOREACH name IN ARRAY ARRAY['candidates','topic_preferences','topic_promotions','topic_workspaces','topic_proposal_feedback','learnings','learning_applications','reviews','review_insights','artifacts','rubrics','rubric_versions','predictions','calibration_results','calibration_rule_suggestions'] LOOP
  EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS group_id TEXT', name);
  IF name = 'topic_workspaces' THEN
   EXECUTE 'ALTER TABLE topic_workspaces DROP CONSTRAINT IF EXISTS topic_workspaces_pkey';
  END IF;
  EXECUTE format('ALTER TABLE %I ALTER COLUMN account_id DROP NOT NULL', name);
  EXECUTE format('UPDATE %I t SET group_id=m.group_id FROM account_group_memberships m WHERE t.group_id IS NULL AND t.user_id=m.user_id AND t.account_id=m.platform_account_id AND m.left_at IS NULL',name);
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I(user_id,group_id)',name||'_user_group_ix',name);
 END LOOP;
END $$;
--> statement-breakpoint

ALTER TABLE audience_signals ADD COLUMN IF NOT EXISTS group_id TEXT;
--> statement-breakpoint
UPDATE audience_signals t SET group_id=m.group_id FROM account_group_memberships m WHERE t.group_id IS NULL AND t.user_id=m.user_id AND t.account_id=m.platform_account_id AND m.left_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audience_signals_user_group_ix ON audience_signals(user_id,group_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS topic_workspaces_group_ux ON topic_workspaces(user_id,group_id) WHERE group_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS topic_workspaces_legacy_ux ON topic_workspaces(user_id,account_id) WHERE account_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_topic_preferences_identity_v2;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_identity_v2 ON topic_preferences(user_id,account_id,keyword,direction) WHERE account_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_topic_preferences_group_identity ON topic_preferences(user_id,group_id,keyword,direction) WHERE group_id IS NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS ux_learnings_active_content_fingerprint;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_learnings_active_content_fingerprint ON learnings(user_id,account_id,content_fingerprint) WHERE account_id IS NOT NULL AND validation_status <> 'discarded' AND content_fingerprint IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_learnings_group_content_fingerprint ON learnings(user_id,group_id,content_fingerprint) WHERE group_id IS NOT NULL AND validation_status <> 'discarded' AND content_fingerprint IS NOT NULL;
--> statement-breakpoint

-- 历史账号入口的新写入冻结当前真实成员归属；已有行绝不随账号转组重写。
CREATE OR REPLACE FUNCTION stamp_shared_domain_group() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.group_id IS NULL AND NEW.account_id IS NOT NULL THEN
  SELECT group_id INTO NEW.group_id FROM account_group_memberships
   WHERE user_id=NEW.user_id AND platform_account_id=NEW.account_id AND left_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DO $$ DECLARE name TEXT; BEGIN
 FOREACH name IN ARRAY ARRAY['candidates','topic_preferences','topic_promotions','topic_workspaces','topic_proposal_feedback','learnings','learning_applications','reviews','review_insights','artifacts','rubrics','rubric_versions','predictions','calibration_results','calibration_rule_suggestions','audience_signals'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS shared_domain_group_stamp ON %I',name);
  EXECUTE format('CREATE TRIGGER shared_domain_group_stamp BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION stamp_shared_domain_group()',name);
 END LOOP;
END $$;
--> statement-breakpoint
