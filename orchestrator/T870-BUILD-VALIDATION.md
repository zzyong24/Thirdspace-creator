# T-870 构建验证：内容雷达选题一键升级项目

日期：2026-08-17

## 验收结论

- 内容雷达的已完成选题卡新增主动作「一键升级项目」。未写入选题池时，点击会先保存当前编辑值，再调用现有 `candidates.promote` 正式立项；已写入选题池时直接立项。
- 点击本身即构成用户确认，不要求再跳到选题中心二次确认；成功后直接进入 `/projects/{projectId}`。
- 保留原「确认写入选题池」为次动作，用户仍可只收题、不立项。
- 立项仍复用正式 Candidate → Project 服务和既有 promotion 后置引用装配，来源作品、逐字稿哈希、拆解、改编策略与初稿种子继续沿既有证据链进入项目。
- `candidates.promote` 成功结果现在可安全重放：重复请求返回原 promotion / Project，不再创建重复项目；只有候选状态已立项但 promotion 关联缺失时才失败关闭。
- 确认成功但立项暂时失败时，选题不会丢失；页面回读最新状态并提示可安全重试。

## TDD 证据

红测先固定了两个既有缺口：

1. 重复调用 `candidates.promote` 会抛 `PromoteStateError`，不能在弱网响应丢失后安全重试。
2. 内容雷达选题卡没有「一键升级项目」动作，也没有确认后立项失败的保留/重试行为。

实现后验证：

```text
pnpm --dir frontend exec vitest run \
  src/features/intelligence/intelligence-workbench.test.tsx \
  src/server/project-script-truth.test.ts
结果：2 files passed，54 tests passed

pnpm --dir backend exec vitest run \
  src/modules/candidate/candidate.service.test.ts \
  src/modules/candidate/candidate.contract.test.ts \
  src/modules/candidate/candidate.repository.integration.test.ts \
  src/modules/intelligence/project-reference.service.test.ts \
  src/modules/intelligence/topic-preview-runner.test.ts
结果：5 files passed，61 tests passed

pnpm --dir frontend exec tsc --noEmit
结果：通过

pnpm --dir backend exec tsc --noEmit
结果：通过

pnpm --dir contract exec tsc --noEmit
结果：通过

pnpm --dir frontend exec eslint \
  src/features/intelligence/intelligence-workbench.tsx \
  src/features/intelligence/intelligence-workbench.test.tsx \
  tests/e2e/content-radar-one-click-project.spec.ts
结果：通过

pnpm --dir frontend exec playwright test \
  tests/e2e/content-radar-one-click-project.spec.ts --project=e2e
结果：1 passed；隔离账号从公开 RSS 采集、手动逐字稿、正式选题生成、页面点击、项目回读到重复立项均通过

node orchestrator/process/boundary-scan.mjs
结果：无新增边界违规；剩余 5 条均为既有基线

git diff --check
结果：通过
```

全量 `reconcile` 已运行，但仓库级 Gate 仍因既有看板超限、历史 review/frontend receipt 失效等
106 项存量漂移返回失败；本次 focused Gate、orphan/asset/boundary/knowledge 检查均通过。T-870 没有修改
已审核的 T-642 历史 SPEC，避免把本次增量需求伪装成旧审核结论。

## 真实页面旅程

- 每次运行创建全新的隔离 PGlite 工作区与隔离账号，不读取或修改用户真实账号、项目和模型密钥。
- 通过正式 contract 采集 W3C 公开 RSS、粘贴逐字稿并生成选题候选；生成环节使用本地 OpenAI-compatible 可控模型服务，避免外部费用和结果漂移，但仍经过正式模型配置、runner、候选与项目服务。
- CreatorOS 真实页面在 `1536×1024` 与 `1024×720` 两档窗口均显示「确认写入选题池」和主动作「一键升级项目」。
- 页面点击后直接进入新项目，正式 `projects.get` 回读标题一致；再次调用 promotion 返回同一 `projectId`，没有创建重复项目。
- 运行时曾暴露两处验收脚本问题并已纠正：`intelligence.runs.get` 的状态位于 `run.status`；React 完成 hydration 后再按目标作品卡片加载详情。二者均未作为产品成功冒报。

## 回归覆盖

- 未确认候选：确认一次 → promotion 一次 → 进入新项目。
- 已确认候选：不重复确认 → promotion 一次 → 进入原/新项目。
- promotion 失败：候选仍存在，重新读取状态，按钮可再次点击。
- promotion 请求重放：返回第一次的同一 Project，项目创建只发生一次。
- 项目引用与脚本种子读取：复用既有 `project-reference` 与 `project-script-truth` 回归，确认内容雷达证据和初稿仍可被项目侧读取。
