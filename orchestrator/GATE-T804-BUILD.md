# T-804 BUILD Gate — 审核、视频断点与封面 503 可靠性

日期：2026-08-13

状态：PASS（单元/集成/前端交互、三端类型、架构与语义边界）

## 验收结果

- 审核：结构化模型漏 `finding.category` 时，只补协议字段；空报告、缺顶层结论仍失败关闭。
- 视频：失败任务保存 server-only 分场/信息卡断点；显式重试且输入指纹一致时跳过已完成节点。
- 封面：明确可重试的 submit HTTP 503 使用同一幂等键短重试一次；未知提交状态不重放。
- 轮询：审核任务进入 failed/cancelled 后停止报告读取，既有终态回归通过。
- 范围：未修改积分、扣费、退款、计价、数据归属、产品视觉或外部发布。

## TDD 与自动验证

- RED：新增审核固定契约、视频断点复用、封面 503 同幂等键用例；旧实现分别因未绑定 schema、
  无 checkpoint、503 直接取消而失败。
- GREEN：
  - `ai-worker` 审核模板：3 项通过。
  - `backend` 审核/视频/封面：97 项通过。
  - `backend` AI task server-only runtime 集成：断点固定键且保留 Skill 快照。
  - `frontend` 制作页与审核轮询：36 项通过。
  - `backend`、`ai-worker`、`frontend` TypeScript 检查通过。
  - `boundary-scan`：无新增物理架构违规。
  - `semantic-boundary-scan`：创作判断仍归 Skill，指纹只做协议一致性校验。
- `orphan-scan`：0 error（存量 warning 保留）。

## 全局收尾状态

- `pmem sync` 已完成。
- `reconcile` 未通过：9 error / 8 warning。错误均是全局存量看板膨胀、历史 review/frontend receipt
  漂移，以及本任务正在修改 `video-decisions-runner.ts` 导致 T-802/T-794 receipt 暂时失效；本任务的
  orphan、asset、boundary、knowledge、docs 与 lesson guards 均在同次 reconcile 中通过。
- 上述全局欠债不属于 T-804 的审核/视频恢复/封面 503 验收范围，因此不冒充全绿，也不扩 scope
  机械压缩看板或重签历史任务。

## 已知边界

- 未做真实第三方 503 注入；provider 明确错误对象与真实适配器字段契约已由单测覆盖。
- 未构建安装包、未推送或外部发布；本 Gate 只证明源码可靠性修复完成。
