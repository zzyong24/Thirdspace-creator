# T1124 来源整合独立复核

结论：**需要按功能在当前主线重新移植，禁止直接 merge/cherry-pick 两个来源 HEAD。** 当前 `main` 为 `7de72c56a3016bc9d1128fd26655a4d5c9200334`，共同基点为 `d35f7d57ff952d306071eb40d34127956b067906`。当前已冻结包不包含下述 T1110、T1106 或 T1107 新功能。

## 逐功能结论

| 来源功能 | 分类 | 结论 |
|---|---|---|
| b1 的早期 T1101 intelligence/legacy membership 历史 | 已被 main 替代 | 6 个 intelligence 路径和 `legacy-task-membership.integration.test.ts` 不属于最新 T1110 产品提交；main 已受控整合 `f97a80da` 并继续修复，旧字节不可回灌。 |
| T1110 微信后台原生报表 | 确实新增，但必须当前主线重做整合 SPEC | main 缺 16 个核心新路径；同时需要在 34 个共享路径中移植 contract、migration、装配、scheduler、owner 与 UI 增量。只复制缺失文件会得到不完整系统。来源本人扫码、稳定身份/date/total witness、实际下载和页面 Gate 仍待验。 |
| T1106 分析、采样、cron 与图表点位 | 确实新增待整合 | 12 个路径的功能在 main 没有等价实现。来源隔离证据可以作为 provenance，不能代替 current-main 回归。 |
| T1106 封面比例用途与同组比例 | 确实新增且与 main 冲突 | helper 确实缺失；`canvas-editor*` 与 template library 已被 main 后续 T1117/T1122 等修改。必须把比例功能重放到当前字节，保留错误展示、素材身份、缩略图加载与采证修复。 |
| T1107 排期弹窗布局 | 独立功能，需单独准入 | 仅涉及 dialog 和 calendar control，但它是独立 T1107，不应借 T1106 整合顺带进入。 |

## 推荐最小整合范围

1. **T1110 单独切片**：新增 16 个真正新路径，并逐段移植 34 个共享路径中的 T1110 增量；重新核迁移序号、journal/convergence、contract registry、workspace scope、纯组与账号归属、worker依赖、scheduler和页面装配。
2. **T1106 analytics/chart 单独切片**：12 路径，重验真实采样身份、缺日、有限数值、cron补偿和孤立点。
3. **T1106 canvas labels 单独切片**：4 路径，在当前 main 上做语义补丁并重新取得组件、LED-047、浏览器与视觉证据。
4. **T1107 calendar 单独切片**：2 路径，沿原SPEC建立当前main自己的review/start/验证链。

## 控制面与证据边界

- 来源 SPEC、review、日志与提交保持原字节和 Git 可达；不得拼接或重哈希来源 `events.ndjson` / `review-events.ndjson`。
- 同 ID 的 BACKLOG、receipt、task 状态以 main 为准；来源完成状态与 PASS 只证明来源树。
- b1 的 T1110 最新提交确有 16 个新路径和 34 个共享路径；缺失清单中的另一个新文件 `legacy-task-membership.integration.test.ts` 属更早 T1101 历史。
- 本次没有运行测试、构建、模型、数据库、App或安装，也没有改仓库、提交或删除 worktree。

## Findings

- **INT-001（阻断直接合并）**：T1110 不能按“17 个缺文件”复制；其 contract、迁移、装配和归属闭包跨 34 个当前共享路径。
- **INT-002（阻断直接合并）**：`454e9241` 同时包含 T1106 与独立 T1107；canvas 共享路径已被 main 后续修复，整 branch 合入会覆盖已验收行为。

详细逐路径清单与证据 SHA 见同目录 JSON。
