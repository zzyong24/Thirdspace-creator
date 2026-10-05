CREATE OR REPLACE FUNCTION creatoros_stamp_legacy_shared_group() RETURNS trigger AS $$
DECLARE parent_group TEXT;
BEGIN
 IF NEW.group_id IS NULL THEN
  IF to_jsonb(NEW)->>'project_id' IS NOT NULL THEN
   SELECT group_id INTO parent_group FROM projects WHERE id=to_jsonb(NEW)->>'project_id' AND user_id=NEW.user_id;
  END IF;
  IF parent_group IS NOT NULL THEN NEW.group_id=parent_group;
  ELSIF NEW.account_id IS NOT NULL THEN
   SELECT group_id INTO NEW.group_id FROM account_group_memberships WHERE platform_account_id=NEW.account_id AND user_id=NEW.user_id AND left_at IS NULL;
   IF NEW.group_id IS NULL THEN NEW.group_id='grp_legacy_'||NEW.account_id; END IF;
  END IF;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['knowledge_items','benchmark_sources','trend_sources','favorites_folders','knowledge_folders','assets','asset_uploads','artifacts','learnings','learning_applications','reviews','review_insights','rubrics','rubric_versions','predictions','calibration_results','candidate_topics','candidate_feedbacks','pending_document_commits','pending_generated_asset_commits','account_skill_overlays','account_skill_overlay_versions'] LOOP
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='group_id') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='account_id') THEN
   EXECUTE format('DROP TRIGGER IF EXISTS legacy_shared_group_stamp ON %I',t);
   EXECUTE format('CREATE TRIGGER legacy_shared_group_stamp BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION creatoros_stamp_legacy_shared_group()',t);
  END IF;
 END LOOP;
END $$;
