# T-767 BUILD Gate — 改稿后审核与盲预测新鲜度

日期：2026-08-11

## 结论

已消除两类僵尸状态：

1. `router.refresh()` 带回同版本的新审核报告时，消费 hook 按真实 `artifactVersion + reviewedAt`
   选择较新报告，不再让首屏 `useState` 冻住旧 block/risk。
2. 最新锁定盲预测早于当前脚本版本时，旧预测仍可查看但退出当前稿锁定态，原位置显示“稿已改动”
   并恢复“重新盲预测”；新预测继续使用既有确认与不可变锁定链。

没有新增数据库字段、迁移、接口、远端调用或视觉布局。

## TDD 与验证

- 红测：同版本新 report id 无法替换旧报告；`prediction.stale=true` 仍显示“已锁定”且无重试入口。
- 绿测：T-767 聚焦 4 files / 15 tests PASS。
- 审核、发布门、设置与稿面联合回归：8 files / 89 tests PASS。
- frontend typecheck：PASS。
- frontend production build：PASS；既有 Turbopack broad trace warnings 保留。
- 定向 ESLint：0 error / 7 existing warnings。
- boundary：0 新违规（既有基线 5）；semantic-boundary：PASS；orphan：0 error / 100 warning；
  test-integrity：0 error / 1 warning；`git diff --check`：PASS。
- 用户明确要求不跑视觉校验；本任务也没有视觉改动。

## 保留风险

- 历史 prediction 没有脚本 version id，本轮按仓库已有、真实的 prediction/script `createdAt`
  判定“脚本是否在预测后更新”。时间缺失或非法时不猜测过期。若未来需要精确识别“恢复到较早版本”
  的内容身份，应另行评审 prediction 版本锚迁移，不能在本回归中偷偷扩 schema。
- 全局 `reconcile` 仍被 T-765/T-746 过期 review receipt 与 T-727/T-722 frontend receipt 漂移
  阻断；不是 T-767 引入，未洗绿。

