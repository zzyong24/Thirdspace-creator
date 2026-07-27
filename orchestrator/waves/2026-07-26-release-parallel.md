# 2026-07-26 明日发版并行波次

## 范围

本波次只推进四项既有任务，不新增产品方向：

1. T-536 收藏夹错误分类与浏览器档案锁恢复；
2. T-537 内容雷达登录型来源选择采集账号；
3. T-517 生产预设定时任务底座；
4. T-519 用户知识文件工作区。

T-537 只覆盖内容雷达的 `creator_profile`、`favorites_folder`、`darkhorse_query`。经营数据、
作品详情、评论及其他自动化任务不增加 collector 选择。

## Lane 与 write set

| Lane | 任务序列 | 当前波次 write set | 合并顺序 |
|---|---|---|---|
| A | T-536 → T-537 | T-536：收藏错误/CDP/Chromium guard/内容雷达错误 UI；T-537：intelligence contract、service、adapter、内容雷达来源 UI | 先合 T-536；T-537 CONTRACT 过审后从最新主线 BUILD |
| B | T-517 | 新最小 automation CONTRACT；过审后只改 scheduling/execution/automation UI 与对应 contract | 第二 |
| C | T-519 | 新最小 knowledge CONTRACT；过审后只改 assets/knowledge/search/knowledge UI 与对应 contract | 第三 |

三个 CONTRACT 作者不得修改 `BACKLOG.md`、`ARTIFACT_MANIFEST.yaml`、`DECISION_LOG.md`、
`TRACEABILITY_MATRIX.md` 或彼此的 spec；控制面由主代理串行合入。涉及
`frontend/src/server/persistence-client.ts` 的实现统一在合并队列中串行处理。

## Gate 与停止线

- T-537/T-517/T-519：PLAN/CONTRACT 独立评审和确认②前不得改生产实现。
- 每条 lane 同一障碍失败两次即停止并报告；hook/permission 拒绝视为政策阻断。
- 每次合入后由主代理重跑定向测试、typecheck/build、boundary、orphan、reconcile。
- 明日发版只纳入已经完成全链验证的任务；未通过 CONTRACT 或真机门的能力不得伪报完成。
