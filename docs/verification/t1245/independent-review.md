# T1245 候选独立复核

## 复核对象

本次只评静态候选，不改产品或测试，不启动浏览器。复核时的文件 SHA-256：

- UI 变更提案 `automations-local-css.candidate.patch`：`3e50a70c1426b585bd2bd3fd8ff4c39cb3e0e0fcc52716e522faabd0c2ae921b`
- Playwright 提案 `automations-run-now-layout.candidate.ts`：`2477a5252387e89d6354ab03795bf1d539a200b9cb573597946357e314a73f6e`
- 预算展开 `candidate-budget-analysis.json`：`a034d50d0db74402bf8618b9549b4de974640f4aba15d395e0d042161d4129b2`
- 基线保留声明 `original-preservation.json`：`c008f3ddb59d11095c2b3a54f0bc813b6a7553669841ebe3686f981cbf290f3d`

## 结论

这版候选**暂不通过独立复核**，原因是新增的运行详情断言与当前真实详情选择状态不一致。其余样式范围局限在自动化页面现有组件；不改业务请求、归属或登录逻辑。这里是源代码与候选验证流程的静态判断，候选没有渲染，不能给视觉结果签字。

## 必须修正的一点

`responsiveEvidence` 从已刷新的真实作业行点击 `[data-slot="automation-open-detail"]`，随后立即等待 `[data-slot="automation-run-error"]`。但实际 `openDetail` 实现先执行 `setDetailRunId(null)`；`RunDetailDialog` 的 effect 用该空值清除 `selectedRunId`。历史运行列表仍会显示，但运行详情正文只在 `selectedRunId` 匹配某条 run 后渲染。因此本候选没有选择历史运行时，错误正文节点不存在，`toHaveText(AUTH_MESSAGE)` 会等待至超时。

最小校准是在确认该详情只有一个 `data-run-status="needs_reconnect"` 的原运行项后，通过该运行项的真实 UI 按钮选中它，再等待错误正文并检查原文；不新增 `runNow`，不直接写状态，也不依赖程序化 DOM 事件。请作者按当前正式 UI 消费者修正后提供新 SHA，再做独立复核。

## 其余静态核验

- CSS 提案仅覆盖自动化本地筛选、模板卡、任务行徽标和运行详情弹层，针对原图里的筛选右溢与标题窄列做收缩/换行；未扩成全局导航或共享设计 token 改动，未见业务逻辑变更。方向与 oil-ui-pro 存量项目规则中“长名称可收缩/换行、窄屏按任务顺序重排”的原则一致。
- 候选几何断言使用现有 `automations-current-group`、筛选 aria-label、`automation-template-card`、`automation-row`、运行详情 `data-slot`。`app-sidebar` 在真实侧栏实现中由 `matchMedia("(max-width: 1024px)")` 收拢至 `w-16`，所以 390/900 用 64px 作为预期值、1536 取现有 CSS token 宽度，和当前消费者匹配。
- 候选复制原唯一公共运行旅程，响应式部分只增加 viewport、滚动、几何检查和截图；静态保留声明写明新增公共请求 0、业务写 0，截图新增 12 张。预算分析保留 120 秒内部观察，展开 637 个保守等待槽约 21.23 小时，并预留 24 小时用例/命令预算及 120 小时独立 driver；这是候选文档的静态结果，不是运行验证。
- `fullPage` 截图是否能在运行后清楚呈现嵌套滚动区的当前任务位置，仍需按目标视口实际看图；不能用现有 390 顶部截图替代候选修复后的图。

## 修订版复核（2026-10-11）

作者已按上述结论修订候选。新 E2E 候选 SHA-256 为 `748976450dc39d1f59991c79a624775cd993ffc6cd5e57b36c27cb635cf0e1a7`；CSS 提案仍为 `3e50a70c1426b585bd2bd3fd8ff4c39cb3e0e0fcc52716e522faabd0c2ae921b`。新版本在核对唯一历史 run 后，点击其真实详情按钮再等待授权错误；和当前 `openDetail` 清空 preferred run、需要用户另选历史项的实现相符。与原正式 E2E 的 diff 只有新增几何 helper 和调用；保留原公共请求、写入及状态断言。候选预算 JSON 与新测试源 SHA 相同，643 个 120 秒观察槽为 21.43 小时，24 小时用例预算约留 2.57 小时；120 小时独立 driver 预算仍覆盖有限 driver 声明。

修订版在**静态候选范围**通过独立复核，可以进入项目流程要求的稳态基线/真实视觉复验与后续实现准入；这不等于 CSS 已实施、候选 E2E 已通过或布局修复已通过。修复后的截图仍须实际运行、查看，确认 390/900/1536 下账号筛选、模板卡、原作业操作和运行弹层可见，且没有横向溢出。当前仍未运行任何 T1245 测试或浏览器。
