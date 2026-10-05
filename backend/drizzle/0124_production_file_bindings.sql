-- T1045 原制作版本的精确文件历史审核证明。
CREATE TABLE production_editor_file_binding_requests (
 id text PRIMARY KEY NOT NULL,
 user_id text NOT NULL, account_id text NOT NULL,
 output_id text NOT NULL REFERENCES content_outputs(id) ON DELETE CASCADE,
 request_id text NOT NULL, request_digest text NOT NULL,
 production_id text NOT NULL, revision integer NOT NULL,
 plan_digest text NOT NULL, source_commit_request_id text NOT NULL,
 source_commit_digest text NOT NULL,
 frozen_input jsonb NOT NULL,
 status text NOT NULL CHECK (status IN ('reserved','committed')),
 created_at text NOT NULL,
 UNIQUE(user_id, account_id, output_id, request_id),
 FOREIGN KEY(production_id,revision) REFERENCES production_edit_versions(production_id,revision) ON DELETE CASCADE,
 CHECK(revision >= 1), CHECK(request_digest ~ '^[a-f0-9]{64}$'),
 CHECK(plan_digest ~ '^sha256:[a-f0-9]{64}$'), CHECK(source_commit_digest ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE production_editor_file_bindings (
 id text PRIMARY KEY NOT NULL,
 user_id text NOT NULL, account_id text NOT NULL,
 output_id text NOT NULL REFERENCES content_outputs(id) ON DELETE CASCADE,
 production_id text NOT NULL, revision integer NOT NULL, plan_digest text NOT NULL,
 location text NOT NULL, reference text NOT NULL,
 asset_id text NOT NULL, asset_file_id text NOT NULL, file_digest text NOT NULL,
 binding_request_id text NOT NULL REFERENCES production_editor_file_binding_requests(id) ON DELETE CASCADE,
 created_at text NOT NULL,
 FOREIGN KEY(production_id,revision) REFERENCES production_edit_versions(production_id,revision) ON DELETE CASCADE,
 UNIQUE(user_id,account_id,output_id,revision,location),
 CHECK(revision >= 1), CHECK(plan_digest ~ '^sha256:[a-f0-9]{64}$'), CHECK(file_digest ~ '^[a-f0-9]{64}$')
);
