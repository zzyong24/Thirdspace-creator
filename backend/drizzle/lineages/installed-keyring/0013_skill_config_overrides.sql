CREATE TABLE IF NOT EXISTS skill_config_overrides (
  id TEXT PRIMARY KEY,
  version TEXT,
  system TEXT,
  template TEXT,
  tools JSONB,
  required_facets JSONB,
  output_schema JSONB,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
