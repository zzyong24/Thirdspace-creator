-- 前置schema候选；未登记或执行。编号127须root核真实journal。
CREATE TABLE publication_cover_requests (
 id text PRIMARY KEY,
 user_id text NOT NULL,
 account_id text NOT NULL,
 output_id text NOT NULL,
 publication_id text NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
 client_request_id text NOT NULL,
 request_digest text NOT NULL,
 input_json jsonb NOT NULL,
 status text NOT NULL CHECK (status IN ('reserved','committed')),
 result_revision_id text REFERENCES publication_revisions(id) ON DELETE CASCADE,
 result_json jsonb,
 created_at text NOT NULL,
 committed_at text,
 CONSTRAINT publication_cover_requests_request_ux UNIQUE(user_id,account_id,client_request_id),
 CHECK ((status='reserved' AND result_revision_id IS NULL AND result_json IS NULL AND committed_at IS NULL)
 OR (status='committed' AND result_revision_id IS NOT NULL AND result_json IS NOT NULL AND committed_at IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX publication_cover_requests_owner_target_idx ON publication_cover_requests(user_id,account_id,publication_id);
