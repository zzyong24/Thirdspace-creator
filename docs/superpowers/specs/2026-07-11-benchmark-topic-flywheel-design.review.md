# SPEC 审核记录:benchmark-topic-flywheel-design(T-212)

- **裁决**:✅ **CONCERNS→已处置→可开工 T-212a~d**
- **review_mode**:① cross-family MiniMax（合定位/方案/无缩水）+ ② T-212 研究报告代码接地（模块映射带 file:line）

## MiniMax verdict: CONCERNS（方向完全合定位·飞轮选题弹药；2 major + 2 minor）
逐条处置:
- **[gate-F1 major] §2 复用断言缺 file:line** → **已补**:candidate.service.ts:296/163(source 枚举已含 benchmark)、douyin-cdp.ts:714(aweme/post 已用)、scheduled-collection-scheduler.ts:55/158(sourceKind)、material-links/ 模块、learnings/calibration 模块。MiniMax 给的示例路径(src/lib/crawler…)是幻觉,已用真 file:line 替。
- **[gate-F2 major] §1 TopicBasis=trend 数据源空 无证据** → **已澄清+补证**:topic-task-adapter.ts:48-110,trend 现有 trendSearch(T-182c web 检索)但无对标爆款数据源;本 SPEC 补的正是对标→选题(经 candidate source=benchmark),与 web trend 并存。
- **[gate-F3 minor] 研究报告仅本地路径** → 接受:关键算法(爆款判定中位数×3、防茧房护栏 ±10/探索位/8周衰减/≥3例)已内联进 SPEC §2.2/§2.4,不依赖本地文件。
- **[gate-F4 minor] sidecar 入口未指** → 澄清:CreatorOS 桌面 sidecar 采集底座**已存在**(现 douyin 采集即跑在 Tauri sidecar,playwright + aweme/post),对标采集复用同一底座;非新建 sidecar。

## 结论
方向合定位(§3 飞轮/§选题弹药);复用现成(candidate benchmark 枚举 + aweme/post + scheduler + material-links 全已存在,大多补语义/闭环非重造);边界清晰(采集归 sidecar、dispatch 触发、结构化 runner、精选源非全网爬虫)。**可开工 T-212a→b→c→d**。
