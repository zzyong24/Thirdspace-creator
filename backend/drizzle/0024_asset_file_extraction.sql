-- T-146 切片 a · 用户上传素材主权:asset_files 加文档文本抽取两列。
-- extracted_text: 确定性抽取的全文(PDF→pdf-parse / docx→mammoth / md·txt→UTF-8 直读),可空。
-- extract_status: 抽取状态机(pending/done/failed/unsupported)——三类诚实降级的落点:
--   done=抽到文本;failed=加密/扫描/损坏无文本层;unsupported=非文档类型不抽;pending=排队中。
-- 「资料要点卡」(materialSummary)走既有 media_metadata jsonb,无需新列(见 SPEC §1.1/§6)。
-- additive、幂等(IF NOT EXISTS),不动存量数据(存量文件两列留 NULL)。
ALTER TABLE asset_files ADD COLUMN IF NOT EXISTS extracted_text TEXT;
--> statement-breakpoint
ALTER TABLE asset_files ADD COLUMN IF NOT EXISTS extract_status TEXT;
