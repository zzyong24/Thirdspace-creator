CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  content_category TEXT NOT NULL DEFAULT '',
  creation_mode TEXT NOT NULL,
  status TEXT NOT NULL,
  current_stage TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  starred BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TEXT NOT NULL,
  target_completed_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_data JSONB NOT NULL,
  occurred_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_stages (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, stage)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS project_target_platforms (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  planning_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (project_id, platform)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS content_outputs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT '',
  aspect_ratio TEXT NOT NULL DEFAULT '',
  target_duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  content_role TEXT,
  primary_asset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS output_stages (
  id TEXT PRIMARY KEY,
  content_output_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (content_output_id, stage)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  stage TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3,
  due_at TEXT,
  completed_at TEXT
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  locale TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uk ON users(email);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_uk ON sessions(token_hash);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  kind TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS tags_user_name_uq ON tags(user_id, name);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS entity_tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS entity_tags_tag_entity_uq ON entity_tags(tag_id, entity_type, entity_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS entity_tags_entity_ix ON entity_tags(user_id, entity_type, entity_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS entity_tags_tag_ix ON entity_tags(user_id, tag_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_user_created_ix ON notifications(user_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_user_unread_ix ON notifications(user_id, read_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS search_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL,
  embedding JSONB NOT NULL DEFAULT '[]',
  indexed_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS search_documents_user_entity_uniq ON search_documents (user_id, entity_type, entity_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS search_documents_user_indexed_ix ON search_documents(user_id, indexed_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS search_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  query TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  result_count INTEGER NOT NULL DEFAULT 0,
  searched_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS search_history_user_searched_ix ON search_history(user_id, searched_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  default_home TEXT NOT NULL,
  default_creation_mode TEXT NOT NULL,
  default_visibility TEXT NOT NULL,
  autosave_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  file_naming_rule TEXT NOT NULL DEFAULT '',
  analytics_enabled BOOLEAN NOT NULL DEFAULT TRUE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS model_configurations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  provider TEXT NOT NULL,
  model_name TEXT NOT NULL,
  secret_reference TEXT NOT NULL DEFAULT '',
  settings JSONB NOT NULL,
  base_url TEXT,
  api_format TEXT NOT NULL DEFAULT 'anthropic',
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent_configurations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  capabilities JSONB NOT NULL,
  settings JSONB NOT NULL,
  secret_reference TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS model_config_user_capability ON model_configurations (user_id, capability);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_revision_id TEXT NOT NULL,
  knowledge_type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_items_user_created_ix ON knowledge_items(user_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_revisions (
  id TEXT PRIMARY KEY,
  knowledge_item_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  structured_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_revisions_item_ix ON knowledge_revisions(knowledge_item_id, revision_number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_relations (
  id TEXT PRIMARY KEY,
  source_knowledge_id TEXT NOT NULL,
  target_knowledge_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  strength TEXT NOT NULL DEFAULT '1',
  created_by_type TEXT NOT NULL DEFAULT 'user'
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS knowledge_relations_source_ix ON knowledge_relations(source_knowledge_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  current_file_id TEXT,
  asset_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assets_user_status_ix ON assets(user_id, status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS asset_files (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  checksum TEXT NOT NULL DEFAULT '',
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  media_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS asset_files_asset_version_ux ON asset_files(asset_id, version_number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS asset_uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  current_version_id TEXT,
  stage TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafting',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS artifacts_user_project_ix ON artifacts(user_id, project_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content_text TEXT NOT NULL DEFAULT '',
  content_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_summary TEXT NOT NULL DEFAULT '',
  created_by_type TEXT NOT NULL DEFAULT 'user',
  ai_task_id TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS artifact_versions_artifact_ix ON artifact_versions(artifact_id, version_number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS artifact_relations (
  id TEXT PRIMARY KEY,
  source_artifact_id TEXT NOT NULL,
  target_artifact_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS artifact_relations_source_ix ON artifact_relations(source_artifact_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS thesis_nodes (
  id TEXT PRIMARY KEY,
  artifact_version_id TEXT NOT NULL,
  parent_node_id TEXT,
  node_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS thesis_nodes_version_ix ON thesis_nodes(artifact_version_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS script_sections (
  id TEXT PRIMARY KEY,
  artifact_version_id TEXT NOT NULL,
  parent_section_id TEXT,
  section_type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  start_seconds REAL,
  end_seconds REAL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS script_sections_version_ix ON script_sections(artifact_version_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS evidence_links (
  id TEXT PRIMARY KEY,
  artifact_version_id TEXT NOT NULL,
  thesis_node_id TEXT,
  knowledge_item_id TEXT,
  asset_id TEXT,
  excerpt TEXT NOT NULL DEFAULT '',
  relation_type TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS evidence_links_version_ix ON evidence_links(artifact_version_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS timeline_segments (
  id TEXT PRIMARY KEY,
  artifact_version_id TEXT NOT NULL,
  script_section_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 0,
  production_data JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS timeline_segments_version_ix ON timeline_segments(artifact_version_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS productions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_output_id TEXT NOT NULL,
  production_mode TEXT NOT NULL DEFAULT 'remote_recording',
  status TEXT NOT NULL DEFAULT 'drafting',
  recording_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtitle_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS productions_output_ux ON productions(content_output_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS productions_user_ix ON productions(user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS production_segments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  production_id TEXT NOT NULL,
  script_section_id TEXT,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  start_ms INTEGER NOT NULL DEFAULT 0,
  end_ms INTEGER NOT NULL DEFAULT 0,
  segment_config JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS production_segments_production_ix ON production_segments(production_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS segment_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  production_segment_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  usage_type TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS segment_assets_segment_ix ON segment_assets(production_segment_id, position);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS export_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  production_id TEXT NOT NULL,
  result_asset_id TEXT,
  format TEXT NOT NULL,
  resolution TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  bitrate INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  export_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS export_records_production_ix ON export_records(production_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS publications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_output_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  current_revision_id TEXT,
  external_id TEXT,
  external_url TEXT,
  scheduled_at TEXT,
  published_at TEXT,
  removed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publications_external_ux ON publications(platform, external_id) WHERE external_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publications_user_ix ON publications(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publications_output_ix ON publications(content_output_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS publication_revisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_asset_id TEXT,
  category TEXT NOT NULL DEFAULT '',
  series TEXT NOT NULL DEFAULT '',
  platform_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  platform_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publication_revisions_pub_ix ON publication_revisions(publication_id, revision_number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS metric_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  ingestion_run_id TEXT,
  captured_at TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_metric_snapshot_pub_source_captured ON metric_snapshots (publication_id, source, captured_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_pub ON metric_snapshots (user_id, publication_id, captured_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_user ON metric_snapshots (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS metric_values (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  metric_snapshot_id TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  numeric_value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  dimensions JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_metric_values_snapshot ON metric_values (user_id, metric_snapshot_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS retention_points (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  position_ms INTEGER NOT NULL,
  retention_rate DOUBLE PRECISION NOT NULL,
  viewer_count INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_retention_points_pub ON retention_points (user_id, publication_id, position_ms);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audience_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  publication_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  dimension_type TEXT NOT NULL,
  dimension_value TEXT NOT NULL,
  percentage DOUBLE PRECISION NOT NULL,
  audience_count INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audience_snapshots_pub ON audience_snapshots (user_id, publication_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS external_sources (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  name TEXT NOT NULL,
  source_identifier TEXT NOT NULL DEFAULT '',
  secret_reference TEXT NOT NULL DEFAULT '',
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_external_sources_user ON external_sources (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  external_source_id TEXT NOT NULL,
  run_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  records_received INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  records_rejected INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_runs_source_idem ON ingestion_runs (external_source_id, idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_user ON ingestion_runs (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ingestion_errors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ingestion_run_id TEXT NOT NULL,
  record_key TEXT NOT NULL,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL DEFAULT '',
  rejected_payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ingestion_errors_run ON ingestion_errors (user_id, ingestion_run_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ingestion_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ingestion_run_id TEXT NOT NULL,
  record_key TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ux_ingestion_records_run_key ON ingestion_records (ingestion_run_id, record_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ingestion_records_run ON ingestion_records (user_id, ingestion_run_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  report_artifact_id TEXT,
  review_type TEXT NOT NULL,
  status TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_reviews_project ON reviews (user_id, project_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS review_insights (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_review_insights_review ON review_insights (user_id, review_id, priority);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS review_publications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  review_id TEXT NOT NULL,
  publication_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS reviews_review_publication_uq ON review_publications (review_id, publication_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS learnings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  review_id TEXT,
  learning_type TEXT NOT NULL DEFAULT 'strategy',
  title TEXT NOT NULL,
  insight TEXT NOT NULL DEFAULT '',
  recommendation TEXT NOT NULL DEFAULT '',
  validation_status TEXT NOT NULL DEFAULT 'candidate',
  confidence_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learnings_status ON learnings (user_id, validation_status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS learning_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  learning_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  application_note TEXT NOT NULL DEFAULT '',
  outcome JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TEXT NOT NULL,
  evaluated_at TEXT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_learning_apps_learning ON learning_applications (user_id, learning_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages (conversation_id, created_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT,
  content_output_id TEXT,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  input_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_key TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  session_id TEXT,
  cost_usd REAL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_tasks_user_idempotency ON ai_tasks (user_id, idempotency_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks (status);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_task_references (
  id TEXT PRIMARY KEY,
  ai_task_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relation_type TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_task_refs_task ON ai_task_references (ai_task_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_task_results (
  id TEXT PRIMARY KEY,
  ai_task_id TEXT NOT NULL,
  result_type TEXT NOT NULL,
  artifact_id TEXT,
  knowledge_item_id TEXT,
  asset_id TEXT,
  result_data JSONB NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_task_results_task ON ai_task_results (ai_task_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS creator_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  differentiation TEXT NOT NULL DEFAULT '',
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_profiles_user ON creator_profiles (user_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS positioning_statements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  one_liner TEXT NOT NULL DEFAULT '',
  keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_anchor_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  version_number INTEGER NOT NULL,
  created_by_type TEXT NOT NULL DEFAULT 'human',
  ai_task_id TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_positioning_statements_version ON positioning_statements (profile_id, version_number);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_positioning_statements_current ON positioning_statements (user_id, profile_id, version_number DESC);
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS positioning_statement_id TEXT;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  tier TEXT,
  delivery_weight TEXT,
  target_persona TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CNY',
  version INTEGER NOT NULL,
  valid_from TEXT,
  valid_to TEXT,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_offers_product_version ON offers (user_id, product_id, version);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  survey_source TEXT,
  entry_code_id TEXT,
  attributed_content_id TEXT,
  attribution_method TEXT,
  attribution_confidence TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  ingestion_run_id TEXT,
  record_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_ingest_key ON leads (user_id, ingestion_run_id, record_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_leads_funnel ON leads (user_id, attributed_content_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS conversion_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  product_id TEXT,
  offer_id TEXT,
  event_type TEXT NOT NULL,
  value DOUBLE PRECISION,
  currency TEXT,
  occurred_at TEXT NOT NULL,
  ingestion_run_id TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_conversion_dedup ON conversion_events (user_id, lead_id, event_type, occurred_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_conversion_funnel ON conversion_events (user_id, lead_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS content_output_products (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_output_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  content_role TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_output_products ON content_output_products (user_id, content_output_id, product_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  angle TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  content_role TEXT,
  product_anchor_id TEXT,
  positioning_fit INTEGER,
  predicted_score INTEGER,
  demand_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pool',
  ai_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audience_signals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  raw_text TEXT NOT NULL DEFAULT '',
  demand_tag TEXT,
  paying_intent TEXT,
  linked_candidate_id TEXT,
  ingestion_run_id TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS topic_promotions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  promoted_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_audience_signals_candidate ON audience_signals (linked_candidate_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ix_candidates_user_status ON candidates (user_id, status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS uq_topic_promotions_candidate ON topic_promotions (candidate_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rubrics (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  current_version_id TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rubric_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_summary TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS rubric_versions_rubric_ver_uq ON rubric_versions (rubric_id, version_number);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  rubric_version_id TEXT NOT NULL,
  predicted_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_conversion JSONB NOT NULL DEFAULT '{}'::jsonb,
  predicted_score TEXT NOT NULL DEFAULT '0',
  confidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  locked_at TEXT,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS calibration_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prediction_id TEXT NOT NULL,
  ingestion_run_id TEXT NOT NULL,
  actual_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  deviation JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS calibration_results_prediction_uq ON calibration_results (prediction_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calibration_results_run_idx ON calibration_results (ingestion_run_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS platform_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_handle TEXT NOT NULL,
  secret_reference TEXT,
  follower_baseline INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS platform_accounts_handle_ux ON platform_accounts(user_id, platform, account_handle);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS platform_accounts_user_created_ix ON platform_accounts(user_id, created_at);
--> statement-breakpoint
ALTER TABLE publications ADD COLUMN IF NOT EXISTS account_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS publications_account_ix ON publications(account_id);
--> statement-breakpoint
ALTER TABLE project_target_platforms ADD COLUMN IF NOT EXISTS account_id TEXT;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS project_target_platforms_account_ix ON project_target_platforms(account_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS content_calendar_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  planned_at TEXT NOT NULL,
  content_output_id TEXT,
  candidate_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  note TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS publishing_cadences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  frequency TEXT NOT NULL,
  preferred_slots JSONB NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS content_calendar_entries_window_ix ON content_calendar_entries(user_id, account_id, planned_at);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS publishing_cadences_account_ux ON publishing_cadences(user_id, account_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS material_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  content_output_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'reference',
  stage TEXT NOT NULL DEFAULT 'research',
  added_by_type TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_links_user_project_ix ON material_links(user_id, project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS material_links_entity_ix ON material_links(user_id, entity_type, entity_id);
