-- T-623：新建定位母版保留不可变历史，但旧版本不再作为当前母版。
ALTER TABLE creator_profiles
  ADD COLUMN IF NOT EXISTS statement_version_floor INTEGER NOT NULL DEFAULT 0;
