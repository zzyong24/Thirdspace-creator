# GATE T-610 — BUILD

## 结论

PASS。人工采纳经验现已在 Learnings 领域内去重并直接成为知识库可见的
`validated` 事实；雷达详情按唯一来源聚合历史快照；抖音嵌套播放 URL 在进入 ffmpeg
前解包。

## 自动化证据

- Backend：
  `pnpm --dir backend exec vitest run src/modules/learnings/learnings.service.test.ts src/modules/learnings/learnings.contract.test.ts src/modules/learnings/learnings.repository.integration.test.ts`
  — 3 files / 39 tests PASS。
- Frontend + ingestion：
  `pnpm --dir frontend exec vitest run src/features/copilot/chat-learning-card.test.tsx src/features/copilot/ai-copilot-interactions.test.tsx src/features/intelligence/intelligence-workbench.test.tsx src/server/ingestion/douyin-cdp.test.ts`
  — 4 files / 183 tests PASS。
- 知识库 validated 投影：
  `pnpm --dir frontend exec vitest run src/features/knowledge/knowledge-experience-merge.test.tsx`
  — 1 file / 14 tests PASS。
- TypeScript：backend / frontend `tsc --noEmit` 均 PASS。
- 物理边界：`node orchestrator/process/boundary-scan.mjs --quiet` PASS。
- 补丁完整性：`git diff --check` PASS。

## 当前真实库副本验收

对
`~/Library/Application Support/cloud.aitongban.creatoros/db`
做只读副本后执行正式迁移：

- 迁移前经验：`candidate=4 / validated=29 / discarded=1`。
- 迁移后经验：`validated=32 / discarded=2`；3 条唯一人工采纳经验进入知识库，1 条
  重复经验被保留为 discarded 历史。
- 第二次启动再次跑迁移：计数仍为 `validated=32 / discarded=2`，无额外变化。
- 截图作品“新手如果从 80 个 AI 工具中选择”的真实库关系：
  `1 item / 1 distinct source / 3 snapshots`。因此存储层作品与来源已经去重，截图问题是
  历史快照被逐条误展示；新 UI 会显示一条来源并标注“累计采集 3 次”。

## 日志复核

当前日志系统持续写
`sidecar-YYYY-MM-DD[-N].log.enc`，旧 `sidecar.log` 只是历史明文遗留，不存在停止落盘。
最新加密日志里的真实程序缺陷是：

`aweme/v1/play/?video_id=https://...douyinstatic.com/...`

被原样交给 ffmpeg 后报 `Invalid data found when processing input`。分享页和 detail API
两条解析路径现共用同一个 URL 规范化函数，回归夹具均已覆盖。
