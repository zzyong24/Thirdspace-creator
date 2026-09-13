CREATE TABLE IF NOT EXISTS integration_credentials (user_id text NOT NULL, provider text NOT NULL, encrypted_secret text NOT NULL, updated_at text NOT NULL, PRIMARY KEY(user_id,provider));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS redfox_submissions (user_id text NOT NULL, input_hash text NOT NULL, fingerprint text NOT NULL, call_id text NOT NULL, task_id text, observation jsonb, PRIMARY KEY(user_id,input_hash));
