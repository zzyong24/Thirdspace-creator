-- 展示缓存版本随业务事务提交可见，回滚不会污染版本。无业务数据迁移。
CREATE TABLE page_read_revision (id integer PRIMARY KEY CHECK (id = 1), version bigint NOT NULL DEFAULT 0);
--> statement-breakpoint
INSERT INTO page_read_revision (id, version) VALUES (1, 0);
--> statement-breakpoint
CREATE FUNCTION bump_page_read_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE page_read_revision SET version = version + 1 WHERE id = 1;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON projects FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON candidates FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON content_outputs FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON publications FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON publication_revisions FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON metric_snapshots FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON metric_values FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
--> statement-breakpoint
CREATE TRIGGER page_read_revision_changed AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON retention_points FOR EACH STATEMENT EXECUTE FUNCTION bump_page_read_revision();
