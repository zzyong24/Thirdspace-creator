-- =====================================================================================
-- [T-349] 对标选题视频(benchmark_works)单条按需逐字稿抓取基座 —— 逐字稿独立落点。
--
-- 背景:transcribe 原语(iesdouyin 直链 → ffmpeg 抽音 → 云 ASR)已存在(favorites-distill /
-- transcribe-runner 复用),但对标他人作品此前无逐字稿落点。**origin 隔离铁律**:对标他人作品
-- 逐字稿**永不建 imported project/artifact**(否则污染 creative-context/ChatBox/candidate/SEAM
-- 的 imported/reconstructed origin 隔离,把他人作品当本人已确认前提)——故逐字稿落在 benchmark_works
-- **自身**,不进 projects/artifacts(同 favorites_items.transcript 先例,迁移 0039)。
--
-- 两列 additive(benchmark_works,IF NOT EXISTS 幂等,可重跑;不动任何存量表/列):
--   ① transcript        —— 对标作品逐字稿(独立落点,非 project artifact)。NULL=未抓。
--   ② transcript_status —— null(未抓)| pending(抓取中)| done | failed(可重试)
--                          | skipped(图集/无口播 → transcribeOne 返 null,诚实非失败)。
-- =====================================================================================

ALTER TABLE benchmark_works ADD COLUMN IF NOT EXISTS transcript TEXT;
--> statement-breakpoint
ALTER TABLE benchmark_works ADD COLUMN IF NOT EXISTS transcript_status TEXT;
