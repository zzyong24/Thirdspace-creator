-- T-599: content-calendar remains the single schedule writer. Add a real
-- project relation and a date-only value without deleting legacy bindings.
ALTER TABLE content_calendar_entries
  ADD COLUMN IF NOT EXISTS project_id TEXT;
--> statement-breakpoint
ALTER TABLE content_calendar_entries
  ADD COLUMN IF NOT EXISTS planned_date TEXT;
--> statement-breakpoint

-- Existing contract rows must carry a legal UTC ISO instant. Any invalid row
-- aborts the whole migration; guessing a date would silently change a plan.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM content_calendar_entries
    WHERE planned_at !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$'
  ) THEN
    RAISE EXCEPTION 'content_calendar_entries contains an invalid planned_at';
  END IF;

  PERFORM planned_at::timestamptz
  FROM content_calendar_entries;
END
$$;
--> statement-breakpoint

UPDATE content_calendar_entries
SET planned_date = substring(planned_at, 1, 10)
WHERE planned_date IS NULL;
--> statement-breakpoint

-- Only deterministic ownership-preserving chains may backfill project_id.
-- content_outputs inherits ownership through projects; topic_promotions also
-- has its own user/account stamp and must agree with both entry and project.
WITH project_chains AS (
  SELECT
    entry.id AS entry_id,
    project.id AS project_id
  FROM content_calendar_entries AS entry
  JOIN content_outputs AS output
    ON output.id = entry.content_output_id
  JOIN projects AS project
    ON project.id = output.project_id
   AND project.user_id = entry.user_id
   AND project.account_id = entry.account_id

  UNION ALL

  SELECT
    entry.id AS entry_id,
    project.id AS project_id
  FROM content_calendar_entries AS entry
  JOIN topic_promotions AS promotion
    ON promotion.candidate_id = entry.candidate_id
   AND promotion.user_id = entry.user_id
   AND promotion.account_id = entry.account_id
  JOIN projects AS project
    ON project.id = promotion.project_id
   AND project.user_id = entry.user_id
   AND project.account_id = entry.account_id
),
unique_chains AS (
  SELECT
    entry_id,
    min(project_id) AS project_id
  FROM project_chains
  GROUP BY entry_id
  HAVING count(DISTINCT project_id) = 1
),
eligible AS (
  SELECT
    entry.id AS entry_id,
    entry.user_id,
    entry.account_id,
    chain.project_id,
    entry.status
  FROM content_calendar_entries AS entry
  JOIN unique_chains AS chain
    ON chain.entry_id = entry.id
  WHERE entry.project_id IS NULL
),
safe_targets AS (
  SELECT candidate.*
  FROM eligible AS candidate
  WHERE candidate.status NOT IN ('planned', 'missed')
     OR (
       SELECT count(*)
       FROM eligible AS competing
       WHERE competing.user_id = candidate.user_id
         AND competing.account_id = candidate.account_id
         AND competing.project_id = candidate.project_id
         AND competing.status IN ('planned', 'missed')
     ) = 1
)
UPDATE content_calendar_entries AS entry
SET project_id = target.project_id
FROM safe_targets AS target
WHERE entry.id = target.entry_id;
--> statement-breakpoint

ALTER TABLE content_calendar_entries
  ALTER COLUMN planned_date SET NOT NULL;
--> statement-breakpoint

ALTER TABLE content_calendar_entries
  ADD CONSTRAINT content_calendar_entries_planned_date_ck
  CHECK (
    planned_date ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date(planned_date, 'YYYY-MM-DD'), 'YYYY-MM-DD') = planned_date
  );
--> statement-breakpoint

ALTER TABLE content_calendar_entries
  ADD CONSTRAINT content_calendar_entries_project_fk
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
--> statement-breakpoint

CREATE UNIQUE INDEX content_calendar_entries_active_project_ux
  ON content_calendar_entries(user_id, account_id, project_id)
  WHERE project_id IS NOT NULL
    AND status IN ('planned', 'missed');
--> statement-breakpoint

CREATE INDEX content_calendar_entries_date_window_ix
  ON content_calendar_entries(user_id, account_id, planned_date);
