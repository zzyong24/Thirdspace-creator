-- 平台评论由真实账号拥有的 Publication 冻结归组，账号转组不重归历史评论。
UPDATE audience_signals AS s SET group_id=p.group_id
FROM publications AS p
WHERE s.publication_id=p.id AND s.user_id=p.user_id AND s.account_id=p.account_id
  AND s.group_id IS DISTINCT FROM p.group_id;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION t1022_freeze_audience_publication_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fact_group text;
BEGIN
  IF NEW.publication_id IS NOT NULL THEN
    SELECT p.group_id INTO fact_group FROM publications p
      WHERE p.id=NEW.publication_id AND p.user_id=NEW.user_id AND p.account_id=NEW.account_id;
    IF FOUND THEN NEW.group_id:=fact_group; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS t1022_audience_publication_group ON audience_signals;
--> statement-breakpoint
CREATE TRIGGER t1022_audience_publication_group BEFORE INSERT OR UPDATE OF publication_id,account_id,user_id,group_id
ON audience_signals FOR EACH ROW EXECUTE FUNCTION t1022_freeze_audience_publication_group();
