CREATE TABLE IF NOT EXISTS resource_access_grant_uses (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,grant_id TEXT NOT NULL REFERENCES resource_access_grants(id),consumer_type TEXT NOT NULL,consumer_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(grant_id,consumer_type,consumer_id));
--> statement-breakpoint
-- SEMANTIC_BOUNDARY_ALLOW: 只记录真实资源ID在新consumer引用中的使用；不判断创作相关性。组迁移只改group_id不触发使用。
CREATE OR REPLACE FUNCTION record_workspace_grant_use() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d jsonb:=to_jsonb(NEW); target_group text; owner_id text; ref_id text; ref_type text; payload jsonb;
BEGIN
 owner_id:=d->>'user_id';target_group:=d->>'group_id';
 IF TG_TABLE_NAME IN ('material_links','content_outputs') THEN
   SELECT user_id,group_id INTO owner_id,target_group FROM projects WHERE id=d->>'project_id';
 ELSIF TG_TABLE_NAME='publication_revisions' THEN
   SELECT user_id,group_id INTO owner_id,target_group FROM publications WHERE id=d->>'publication_id';
 ELSIF TG_TABLE_NAME='ai_messages' THEN
   SELECT user_id,group_id INTO owner_id,target_group FROM ai_conversations WHERE id=d->>'conversation_id';
 END IF;
 IF target_group IS NULL OR owner_id IS NULL THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='material_links' THEN ref_id:=d->>'entity_id';ref_type:=d->>'entity_type';
 ELSIF TG_TABLE_NAME='content_outputs' THEN ref_id:=d->>'primary_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='publication_revisions' THEN ref_id:=d->>'cover_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='knowledge_items' THEN ref_id:=d->>'asset_id';ref_type:='asset';
 ELSE payload:=CASE WHEN TG_TABLE_NAME='ai_messages' THEN d->'attachments' ELSE d->'input_data' END;
 END IF;
 INSERT INTO resource_access_grant_uses(id,user_id,grant_id,consumer_type,consumer_id,created_at)
 SELECT 'grant-use-'||md5(g.id||':'||TG_TABLE_NAME||':'||(d->>'id')),owner_id,g.id,TG_TABLE_NAME,d->>'id',now()::text
 FROM resource_access_grants g WHERE g.user_id=owner_id AND g.target_group_id=target_group AND g.revoked_at IS NULL
 AND ((g.resource_type=ref_type AND g.resource_id=ref_id) OR (payload IS NOT NULL AND jsonb_path_exists(payload,'$.** ? (@ == $resource)',jsonb_build_object('resource',g.resource_id))))
 ON CONFLICT(grant_id,consumer_type,consumer_id) DO NOTHING;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF entity_id,entity_type ON material_links FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF primary_asset_id ON content_outputs FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF cover_asset_id ON publication_revisions FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF asset_id ON knowledge_items FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF attachments ON ai_messages FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF input_data ON ai_tasks FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
