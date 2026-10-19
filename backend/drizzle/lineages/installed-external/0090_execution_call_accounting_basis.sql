ALTER TABLE execution_calls ADD COLUMN IF NOT EXISTS accounting_basis TEXT NOT NULL DEFAULT 'tokens' CHECK (accounting_basis IN ('tokens', 'requests'));
