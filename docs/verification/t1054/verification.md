# T-1054 — 项目列表创建入口收敛

## 实际结果
删除项目列表标题下的“直接创作作品”链接；空列表创建行动统一为“新建项目”及既有 `/projects/new` 路径。右上角原新建按钮、项目卡片、筛选排序、旧快速创作路由和服务保留。具体本轮变更见 `change.diff`；此前混合未提交改动未重置或纳入本轮实施。

## 本轮发生的检查
| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 独立前置及实施审查 | PASS，0 finding | `spec-round-1.json`、`implementation-review.md` |
| 变更前聚焦红测 | 2 失败、19 通过；顶部仍有按钮，空态仍走快速创作 | `projects-red.log` |
| 删除后项目页及本地弹层回归 | 2 文件、36 项通过，retry 0 | `projects-green.log` |
| LED-047 | 8 文件、158 项通过，retry 0 | `led047.log` |
| TypeScript | exit 0 | `typecheck.log` |
| 变更文件 ESLint | exit 0，0 error、1 既有 singleton import warning；该 import 本轮未改 | `lint.log`、`change.diff` |
| 实际 HTTP 首屏 | `/projects` 200；文案由存在变为不存在，原新建按钮 href 保持 `/projects/new`，8 个真实项目详情链接仍在 | `http-before.json`、`http-after.json` |
| diff check | exit 0 | `diff-check.log` |
| 项目记忆同步 | exit 0 | `pmem-sync.log` |
| 实施状态 | review/implementation 完成，acceptance 待验 | `progress-implementation.log` |
| 全局对账 | 36 errors、0 warnings；原有 35 项错误及首次快照中的看板超 60KB | `reconcile.log`、`reconcile-comparison.json` |

HTTP 初次使用系统代理得到 502；改为直连本机后，修改前与修改后的实际页面均为 200。读取仅使用此前隔离预览账号 `acct-ef4eab23-41`，未新增或修改用户项目数据。测试中的 JSDOM 导航警告不表示真实浏览器导航已发生。

## 验收边界
本轮未使用被禁止的浏览器自动化。实际 HTTP、组件和类型结果只证明删除与既有入口绑定，不冒充正常/最小视口的视觉验收；看板保留待验，不伪造 frontend-validation 回执。全局 reconcile 的真实结果记录在 `reconcile.log`，原全局欠债不改绿。

新增任务及回执使看板首次到 60.1KB，reconcile 已读到该快照；仅缩短本会话 T-1051—T-1053 摘要并保留原状态及完整文档后，实际复查为 59.8KB。`backlog-health-final.log` exit 1，失控的 exit 2 已消除，仍保留原有超过 30KB 的体积欠债；按现行 reconcile.mjs 第 593 行，该结果属于 WARN。未重新跑全量对账，不把首次 36 errors 输出改写成 35；首次故障保存在 `backlog-health-first.json`。
