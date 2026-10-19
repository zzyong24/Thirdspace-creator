-- T-042 评论热榜排序:audience_signals 加点赞数列(热榜排序依据)。
-- NULLABLE:存量评论(本迁移之前入库)无 digg_count 锚,回填需重采;非评论信号也留空。
ALTER TABLE audience_signals ADD COLUMN IF NOT EXISTS like_count INTEGER;
