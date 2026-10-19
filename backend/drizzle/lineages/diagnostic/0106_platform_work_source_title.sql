-- A platform title is populated only from an observed source record.
-- Legacy imported project/output names can be generated fallbacks, so leave
-- pre-existing rows NULL rather than inferring a title from them.
ALTER TABLE platform_works ADD COLUMN IF NOT EXISTS title TEXT;
