# T-1224 测试预算与证据目录校准报告

日期：2026-10-11
实现范围：仅校准 `frontend/tests/e2e/content-radar-one-click-project.spec.ts` 的测试设施；未改产品、操作/schema、权限、fixture、RSS、模型响应、断言、重试或共享索引。依据 [SPEC](../../features/t1224-radar-e2e-budget-evidence.md) 与 [独立复核](./independent-review.md) 实施。

## 改动与消费者核对

| 消费者 | 校准后预算 | 实际生效位置 | 说明 |
|---|---:|---|---|
| `/api/v1/dispatch` 请求 | 120,000 ms | `dispatch()` 的 `page.request.post({ timeout })` | 此助手内所有公开 RPC 请求均显式使用该值。 |
| 页面动作与有限页面观察 | 120,000 ms | 测试开始时 `page.setDefaultTimeout()` | 覆盖 `waitForResponse`、`waitForLoadState("networkidle")`、定位器动作及其余默认超时的页面消费者；`expect` 由诊断配置单独设为 120,000 ms。 |
| 页面导航 | 120,000 ms | 测试开始时 `page.setDefaultNavigationTimeout()` | 覆盖两次 `/intelligence` 页面导航及点击升级后的路由导航。 |
| 项目升级后的 URL 观察 | 120,000 ms | `page.waitForURL()` 显式参数 | 原来的 30,000 ms 已提高。 |
| 采集终态观察 | 120,000 ms | `waitForRun()` 已有默认值 | 保持原值；250 ms 是轮询间隔，不是总期限。 |
| 选题变换终态观察 | 120,000 ms | `waitForTransform()` 默认值 | 原 60,000 ms 提高；不修改任务 deadline、ID、终态判断或重发行为。 |
| 单例测试外层 | 无独立测试上限 | 移除 `test.setTimeout(300_000)`，由既有 `budget-recheck.config.ts` 的 `timeout: 0` 生效 | 只取消 Playwright 测试外层上限，不改上述有限观察及产品任务期限。 |
| visible-copy 输出 | 本轮显式目录 | `CREATOROS_T1224_EVIDENCE_DIR` | 设置时目录相对仓库根解析（绝对路径也接受）；未设置时保留原 `orchestrator/evidence` 默认行为。本轮仅验证了代码与类型，尚未运行真实旅程，不生成新 receipt。 |

原 RSS `https://www.w3.org/blog/news/feed/`、本地 OpenAI 兼容模型替身、隔离数据库、操作输入与所有断言保持不变。媒体/网络信源以及本地模型仍按 SPEC 的边界披露；测试不得被描述为真人模型或真实平台成功。

## 本轮静态验证

- `pnpm --dir frontend exec tsc --noEmit`：退出码 0，无诊断输出。
- `pnpm --dir frontend exec eslint tests/e2e/content-radar-one-click-project.spec.ts`：退出码 0，无诊断输出。
- `git diff --check -- frontend/tests/e2e/content-radar-one-click-project.spec.ts`：退出码 0。
- HEAD：`423edb76632254dc2e0f68d4c8a46e838e5d6f30`。
- 基线测试文件 SHA-256（独评记录）：`a45ebb88512dcdab94cf540cbbcdea41df66cff9eb5245307c117f2ff18c04b7`。
- 校准后测试文件 SHA-256：`c43fb5ff2aa3fe99aaef98a32568f3c3d2d1fff6f2d4bb068449d2477d728339`。
- 本轮未启动 Next、Playwright、浏览器或业务服务；没有新运行截图、trace、网络 attempt 或可见文案回执。因此本报告只证明测试设施静态校准，不证明端到端链路通过。

后续真实执行须由主会话在唯一 Next 服务上按既有诊断配置串行完成：显式设置 `CREATOROS_T1224_EVIDENCE_DIR` 到新的 T-1224 独立证据目录，保留原失败截图/trace，并逐项记录实际 RSS 网络 attempt、页面结果、项目公共回读与本地模型替身边界。不得覆盖 T-870/T-893/T-900 的历史 visible-copy。
