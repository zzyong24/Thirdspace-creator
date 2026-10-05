-- 正常迁移编号及journal由根独占。候选不直接执行共享迁移。
CREATE TABLE moments_candidates (
 id text PRIMARY KEY, user_id text NOT NULL, account_id text NOT NULL,
 moments_id text NOT NULL REFERENCES moments_anchors(id) ON DELETE CASCADE,
 root_id text NOT NULL, record jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX moments_candidates_scope_idx ON moments_candidates(user_id,account_id,moments_id);
