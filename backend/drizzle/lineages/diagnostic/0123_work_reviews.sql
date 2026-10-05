CREATE TABLE IF NOT EXISTS work_review_reports (
 id text PRIMARY KEY, ordinal bigserial NOT NULL, user_id text NOT NULL, account_id text NOT NULL, project_id text NOT NULL, composition_id text NOT NULL,
 scope_key text NOT NULL, snapshot jsonb NOT NULL, frozen_context jsonb NOT NULL, attempt_id text NOT NULL,
 task_id text, execution_task_id text, settled_call_id text, status text NOT NULL, outcome jsonb, error_code text, created_at text NOT NULL,
 CONSTRAINT work_review_report_status CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
 CONSTRAINT work_review_report_success CHECK (status <> 'succeeded' OR (task_id IS NOT NULL AND execution_task_id IS NOT NULL AND settled_call_id IS NOT NULL AND outcome IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_report_attempt_ux ON work_review_reports(user_id,account_id,attempt_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_report_task_ux ON work_review_reports(task_id);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_report_call_ux ON work_review_reports(settled_call_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_review_report_scope_idx ON work_review_reports(user_id,account_id,composition_id,scope_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS work_review_confirmations (
 id text PRIMARY KEY, ordinal bigserial NOT NULL, user_id text NOT NULL, account_id text NOT NULL, project_id text NOT NULL, composition_id text NOT NULL,
 scope_key text NOT NULL, confirmation jsonb NOT NULL, created_at text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS work_review_confirmation_scope_idx ON work_review_confirmations(user_id,account_id,composition_id,scope_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS work_review_requests (
 id text PRIMARY KEY, ordinal bigserial NOT NULL, user_id text NOT NULL, account_id text NOT NULL, project_id text NOT NULL, composition_id text NOT NULL,
 request_id text NOT NULL, request_digest text NOT NULL, operation text NOT NULL, input jsonb NOT NULL,
 status text NOT NULL, report_id text, confirmation_id text, error_code text, created_at text NOT NULL,
 CONSTRAINT work_review_request_operation CHECK (operation IN ('create','confirm')),
 CONSTRAINT work_review_request_status CHECK (status IN ('reserved','committed','failed')),
 CONSTRAINT work_review_request_target CHECK (status <> 'committed' OR (operation = 'create' AND report_id IS NOT NULL AND confirmation_id IS NULL) OR (operation = 'confirm' AND confirmation_id IS NOT NULL)),
 CONSTRAINT work_review_request_failure CHECK (status <> 'failed' OR error_code IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS work_review_request_scope_ux ON work_review_requests(user_id,account_id,request_id);
--> statement-breakpoint
