# T-744 内容雷达改写重试验收

> 验收日期：2026-08-09
>
> 结论：PASS（本任务范围）
>
> 视觉回归：按用户明确要求不运行；本任务仅复用现有按钮、图标与卡片结构。
> 看板状态：仍为 🔨；`taskctl complete` 要求当前提交上的真实浏览器旅程，本轮未用组件测试冒充该证据。

## 用户结果

- 成功但未采纳的改写稿可点击“重新生成改写稿”。
- 已采纳的历史结果仍可重新生成；后续选题被淘汰时不会断链，新结果确认后创建新的选题 ID。
- 同一请求重放保持幂等；不同点击创建独立 transform/task。
- 重试期间旧稿仍可读，候选字段与确认按钮不可用；后端也会拒绝任务未完成时的绕过确认。
- 只在来源快照、逐字稿 hash 与定位版本完全一致时复用拆解和选题；陈旧快照在排队前拒绝。

## TDD 证据

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| 红测 | `pnpm --dir backend exec vitest run src/modules/intelligence/topic-preview-runner.test.ts --reporter=dot` | 1 失败 / 4 通过；成功稿未提供 `reusableCandidate`，且活动任务仍可误确认。 |
| 红测 | `pnpm --dir frontend exec vitest run src/features/intelligence/intelligence-workbench.test.tsx --reporter=dot` | 2 失败 / 42 通过；待采纳和已采纳状态均没有“重新生成改写稿”。 |
| 绿测 | 同上后端命令 | 5 / 5 通过。 |
| 绿测 | 同上前端命令 | 44 / 44 通过。 |
| intelligence 回归 | `pnpm --dir backend exec vitest run src/modules/intelligence --reporter=dot` | 10 个文件，54 / 54 通过。 |

## 工程门禁

| 门禁 | 结果 |
| --- | --- |
| backend typecheck | PASS |
| frontend typecheck | PASS |
| T-744 前端文件 ESLint | PASS，0 error / 0 warning |
| test-integrity | PASS，0 error；保留 1 条既有 coverage 配置 warning |
| boundary-scan | PASS，无新增违规；5 条既有基线 |
| semantic-boundary-scan | PASS |
| orphan-scan | PASS，0 error；100 条既有 warning |
| `git diff --check` | PASS |

## 全仓 reconcile 现状

`node orchestrator/process/reconcile.mjs` 本轮真实结果为 **5 errors / 1 warning**，因此未写成全仓全绿。错误均不属于 T-744 的实现或验收范围：

- T-731 的 review receipt 已过期；其 frontend receipt 仍引用回滚后已不存在的 6 条实现路径。
- T-729、T-727、T-722 的历史 frontend receipt 因 watched path 后续变化而失效。
- BACKLOG 体积 warning 为既有文档健康提示。

上述全局收据需要按各自任务重新实跑或正式归属，禁止修改历史收据冒充通过；T-744 的聚焦逻辑、类型与物理/语义边界门均已独立通过。

## 未伪造的边界

- 本任务未执行视觉回归、真机点击旅程或模型真实付费调用，不把组件测试写成真机证据。
- 本 Gate 只证明 T-744 逻辑与仓库基本安全门通过；正式安装包仍需走项目发布 Skill 规定的 GitHub macOS 公证与 Windows 构建流程。
