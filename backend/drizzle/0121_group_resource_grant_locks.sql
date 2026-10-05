-- SEMANTIC_BOUNDARY_ALLOW: 只验证实际资源ID、所属组、有效授权与消费；不扫描正文或做内容判断。
CREATE OR REPLACE FUNCTION record_workspace_grant_use() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d jsonb:=to_jsonb(NEW); target_group text; owner_id text; ref_id text; ref_type text; payload jsonb; refs jsonb:='[]'; r jsonb; origin_group text; resource_status text; selected_grant_id text;
BEGIN
 owner_id:=d->>'user_id';target_group:=d->>'group_id';
 IF TG_TABLE_NAME IN ('material_links','content_outputs') THEN SELECT user_id,group_id INTO owner_id,target_group FROM projects WHERE id=d->>'project_id';
 ELSIF TG_TABLE_NAME='publication_revisions' THEN SELECT user_id,group_id INTO owner_id,target_group FROM publications WHERE id=d->>'publication_id';
 ELSIF TG_TABLE_NAME='segment_assets' THEN SELECT p.user_id,p.group_id INTO owner_id,target_group FROM production_segments seg JOIN productions prod ON prod.id=seg.production_id JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE seg.id=d->>'production_segment_id' AND seg.user_id=d->>'user_id' AND prod.user_id=d->>'user_id';
 ELSIF TG_TABLE_NAME='export_records' THEN SELECT p.user_id,p.group_id INTO owner_id,target_group FROM productions prod JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE prod.id=d->>'production_id' AND prod.user_id=d->>'user_id';
 ELSIF TG_TABLE_NAME='ai_messages' THEN SELECT user_id,group_id INTO owner_id,target_group FROM ai_conversations WHERE id=d->>'conversation_id';END IF;
 -- 迁移前的NULL组沿用已有父权限；不能把NULL组当作跨组通行证。
 IF target_group IS NULL OR owner_id IS NULL THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM account_groups WHERE id=target_group AND user_id=owner_id) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:引用账号组不存在';END IF;
 IF TG_TABLE_NAME='material_links' THEN ref_id:=d->>'entity_id';ref_type:=d->>'entity_type';
 ELSIF TG_TABLE_NAME='content_outputs' THEN ref_id:=d->>'primary_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='publication_revisions' THEN ref_id:=d->>'cover_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME IN ('knowledge_items','segment_assets') THEN ref_id:=d->>'asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='export_records' THEN ref_id:=d->>'result_asset_id';ref_type:='asset';
 ELSIF TG_TABLE_NAME='ai_messages' THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type','asset','id',v#>>'{}')),'[]') INTO refs FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d->'attachments')='array' THEN d->'attachments' ELSE '[]' END) v WHERE jsonb_typeof(v)='string';
 ELSIF TG_TABLE_NAME='ai_tasks' THEN
  payload:=d->'input_data';
  -- 明确协议字段才是资源引用；正文中恰好出现资源ID不授予也不消费权限。
  SELECT COALESCE(jsonb_agg(jsonb_build_object('type',t.kind,'id',v#>>'{}')),'[]') INTO refs FROM (
   SELECT 'asset' AS kind,jsonb_path_query(payload,'$.**.assetId') AS v UNION ALL SELECT 'asset',jsonb_path_query(payload,'$.**.assetIds[*]')
   UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeId') UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeIds[*]')
   UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeItemId') UNION ALL SELECT 'knowledge',jsonb_path_query(payload,'$.**.knowledgeItemIds[*]')
  ) t WHERE jsonb_typeof(v)='string';
 END IF;
 IF ref_id IS NOT NULL AND ref_type IN ('asset','knowledge') THEN refs:=refs||jsonb_build_array(jsonb_build_object('type',ref_type,'id',ref_id));END IF;
 FOR r IN SELECT DISTINCT value FROM jsonb_array_elements(refs) LOOP
  origin_group:=NULL;resource_status:=NULL;selected_grant_id:=NULL;
  IF r->>'type'='asset' THEN SELECT group_id,status INTO origin_group,resource_status FROM assets WHERE id=r->>'id' AND user_id=owner_id FOR SHARE;
  ELSE SELECT group_id,status INTO origin_group,resource_status FROM knowledge_items WHERE id=r->>'id' AND user_id=owner_id FOR SHARE;END IF;
  IF NOT FOUND OR resource_status='deleted' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:引用资源不存在或已删除，请先修复引用';END IF;
  IF origin_group=target_group THEN CONTINUE;END IF;
  SELECT g.id INTO selected_grant_id FROM resource_access_grants g WHERE g.user_id=owner_id AND g.target_group_id=target_group AND g.origin_group_id=origin_group AND g.resource_type=r->>'type' AND g.resource_id=r->>'id' AND g.revoked_at IS NULL ORDER BY g.id LIMIT 1 FOR SHARE;
  IF selected_grant_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:共享授权已撤销或不存在，请先修复引用';END IF;
  INSERT INTO resource_access_grant_uses(id,user_id,grant_id,consumer_type,consumer_id,created_at) VALUES('grant-use-'||md5(selected_grant_id||':'||TG_TABLE_NAME||':'||(d->>'id')),owner_id,selected_grant_id,TG_TABLE_NAME,d->>'id',now()::text) ON CONFLICT(grant_id,consumer_type,consumer_id) DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_workspace_resource_grant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE origin_group text; resource_status text;
BEGIN
 IF NEW.revoked_at IS NOT NULL THEN RETURN NEW;END IF;
 IF NOT EXISTS(SELECT 1 FROM account_groups WHERE id=NEW.origin_group_id AND user_id=NEW.user_id) OR NOT EXISTS(SELECT 1 FROM account_groups WHERE id=NEW.target_group_id AND user_id=NEW.user_id) THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:授权组不属于当前用户';END IF;
 IF NEW.resource_type='asset' THEN SELECT group_id,status INTO origin_group,resource_status FROM assets WHERE id=NEW.resource_id AND user_id=NEW.user_id FOR SHARE;
 ELSIF NEW.resource_type='knowledge' THEN SELECT group_id,status INTO origin_group,resource_status FROM knowledge_items WHERE id=NEW.resource_id AND user_id=NEW.user_id FOR SHARE;
 ELSE RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:资源类型不支持';END IF;
 IF NOT FOUND OR origin_group IS DISTINCT FROM NEW.origin_group_id OR resource_status='deleted' THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='GROUP_RESOURCE_SCOPE_CONFLICT:资源不可用或归属已变化';END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_resource_grant_alive ON resource_access_grants;
--> statement-breakpoint
CREATE TRIGGER workspace_resource_grant_alive BEFORE INSERT OR UPDATE OF revoked_at,resource_id,origin_group_id,target_group_id,user_id ON resource_access_grants FOR EACH ROW EXECUTE FUNCTION validate_workspace_resource_grant();

--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_grant_use ON segment_assets;
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF asset_id ON segment_assets FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
--> statement-breakpoint
DROP TRIGGER IF EXISTS workspace_grant_use ON export_records;
--> statement-breakpoint
CREATE TRIGGER workspace_grant_use AFTER INSERT OR UPDATE OF result_asset_id ON export_records FOR EACH ROW EXECUTE FUNCTION record_workspace_grant_use();
