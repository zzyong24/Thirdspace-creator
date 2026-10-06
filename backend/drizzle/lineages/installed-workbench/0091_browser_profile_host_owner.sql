ALTER TABLE execution_browser_profile_leases
 ADD COLUMN profile_key TEXT NOT NULL DEFAULT '',
 ADD COLUMN host_instance_id TEXT,
 ADD COLUMN host_operation_id TEXT,
 ALTER COLUMN owner_execution_task_id DROP NOT NULL,
 ALTER COLUMN attempt DROP NOT NULL,
 ALTER COLUMN fence_token DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE execution_browser_profile_leases ADD CONSTRAINT ck_browser_profile_owner CHECK (
 (owner_execution_task_id IS NOT NULL AND attempt IS NOT NULL AND fence_token IS NOT NULL AND host_instance_id IS NULL AND host_operation_id IS NULL)
 OR (owner_execution_task_id IS NULL AND attempt IS NULL AND fence_token IS NULL AND host_instance_id IS NOT NULL AND length(host_instance_id) > 0 AND host_operation_id IS NOT NULL AND length(host_operation_id) > 0)
);
--> statement-breakpoint
DROP INDEX ux_execution_browser_profile_owner;
--> statement-breakpoint
CREATE UNIQUE INDEX ux_execution_browser_profile_owner ON execution_browser_profile_leases(user_id, domain) WHERE profile_key = '';
--> statement-breakpoint
CREATE UNIQUE INDEX ux_execution_browser_physical_profile ON execution_browser_profile_leases(profile_key) WHERE profile_key <> '';
