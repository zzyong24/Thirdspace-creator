-- T1331：只记录新整稿目标的预留版本事实；历史记录不推断、不回填。
ALTER TABLE artifacts ADD COLUMN script_draft_reservation_version_id TEXT;
