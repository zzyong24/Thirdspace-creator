# T-759 BUILD Gate

日期：2026-08-10
结论：本任务范围 PASS；全局 reconcile 仍有 3 个既有 receipt 漂移错误，未洗绿。

## 根因与修复

- 根因一：恢复方案把历史 `inventory` 快照继续当成当前可用素材清单，素材删除或归属变化后，
  `<select value=旧 assetId>` 找不到对应 option，浏览器显示空白。
- 根因二：已确认方案统一只读，失效绑定出现后用户无法移除或改选。
- 修复：当前项目素材加载成功后，它成为唯一可选清单；历史快照只保留失效素材的旧名称。
  失效绑定显示“素材已不可用”，未解决前禁止进入渲染；移除或改选后，决策与当前项目素材快照
  经既有 `confirmProductionEditingPlan` 原子保存。素材清单读取失败时保留旧方案并明确失败，禁止静默
  改绑。
- 边界：没有读取全局/其他项目素材，没有重跑 AI，没有新增视觉结构。

## 实跑证据

- 红测：`video-decision-preview.test.tsx` 新增 2 例后 2 failed / 10 passed，分别复现空白下拉与
  无失效 option。
- 绿测：
  - `video-decision-preview.test.tsx`：12/12 PASS。
  - `production-workbench.test.tsx`：28/28 PASS。
  - 两文件合跑：40/40 PASS。
  - `pnpm --filter creatoros-frontend typecheck`：PASS。
  - 聚焦 ESLint：0 errors / 7 个测试文件既有未使用变量 warnings。
  - `git diff --check`：PASS。
- `node orchestrator/process/reconcile.mjs`：如实 FAIL（3 errors / 9 warnings）。3 个 error 为
  T-746 review receipt、T-727 frontend receipt、T-722 frontend receipt 的既有漂移，不在 T-759
  watched paths 内；boundary、orphan、asset、knowledge 与 consistency 子门均通过。

## 验收边界

用户已明确要求以后不跑视觉校验；本任务没有改布局或视觉体系，使用 DOM/交互契约验证真实名称、
失效状态、禁用门、移除和原子保存。未启动打包、发布或真实模型调用。
