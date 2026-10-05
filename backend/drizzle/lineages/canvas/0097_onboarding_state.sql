CREATE TABLE IF NOT EXISTS onboarding_states (
  user_id text NOT NULL,
  account_id text NOT NULL,
  origin text CHECK (origin IN ('fresh','existing')),
  hidden boolean NOT NULL DEFAULT false,
  collapsed boolean NOT NULL DEFAULT true,
  completed_steps jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(completed_steps) = 'array'),
  updated_at text NOT NULL,
  PRIMARY KEY(user_id,account_id)
);
