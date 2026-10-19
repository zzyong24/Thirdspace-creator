# T-1017 改写优先链路测试报告

日期：2026-09-30。用户本轮明确要求「好的，那你要测试一下」。环境为 macOS、Node v25.9.0、pnpm 10.32.1、Vitest 4.1.8。所有本轮 Vitest 命令显式使用 `--retry=0`。

本报告记录自动化逻辑、组件交互和本地模型协议贯通。真实供应商及最终安装包的真人桌面旅程尚未验证；不作为发布验收 PASS，不将 T-1017 改成完成。主功能实施前的历史 TDD RED 证据缺失，本轮发现并修复的问题不补写为历史 RED。

## 结果

最终 **252 项通过（后端 157、前端 66、Worker 19、契约 10），0 项失败**。最终计数和原始 Vitest JSON 见 [summary.json](t1017-rewrite-first/summary.json)。分组为后端相关回归及贯通、前端、Worker 和共享契约；以文件中的最终执行记录为准。

| 验证 | 结论与范围 |
| --- | --- |
| 后端 | 相关服务、runner、Project 引用、内部批量旧链、数据库迁移、Candidate、Project DTO、标准写稿上下文回归；包含真实 Worker 子进程与 PGlite |
| 前端 | 首稿编辑复制、无定位、不重复生成、重开恢复、旧稿保留、交错响应、超 8 秒轮询、采纳及项目交接 |
| Worker | 真实冻结 Skill/端口、安全错误、旧 strategy_backed 协议及 bundle、模板回归 |
| 契约 | 无定位 ID 兼容、旧请求、新采纳正文编辑、拒绝空正文和来源伪造 |
| 类型 | 前端、Worker、契约完整检查与后端生产代码检查通过；后端含全部旧测试的检查仍失败，见下文 |
| 静态实现复核 | 独立只读 agent 最终 PASS；没有将其描述为执行测试的证据 |

## 可用性贯通覆盖

```mermaid
flowchart LR
  A[真实来源记录及逐字稿] --> B[冻结定位与文案]
  B --> C[真实 Worker 子进程]
  C --> D[一次本地模型响应]
  D --> E[账本结算与正文保存]
  E --> F[编辑并显式采纳]
  F --> G[Candidate 与 Project]
  G --> H[标准写稿上下文]
```

新增 `rewrite-only.integration.test.ts` 验证以下情况：

- 无定位和完整定位都能成功；只调用 adapted-draft Skill，一次纯文本请求、不要求 JSON、不创建额外选题卡模型任务。
- 完整定位中的画像、能力、规则进入模型；任务创建后当前定位变化不替换冻结输入，陈旧客户端版本不作依据。
- 模型正文经真实子进程、IPC、后端调用账本结算及 checkpoint 保存，主任务变为成功。
- 同生成键重放返回同 task/transform，不再发模型请求。
- 采纳写入失败不影响已保存正文及主任务；Candidate 已提交而响应丢失时，重试及并发采纳仍只有一个 Candidate，正文取实际已保存的用户编辑稿。
- Candidate 升级 Project 后能读回真实引用、正文 seed、来源文案及实际定位，标准写稿上下文诚实说明策略和拆解未生成，不因此受阻。这证明上下文装配，**没有执行真实供应商的后续 script.draft**。
- 新尝试失败时，旧成功正文和已采纳编辑保留；其他账号读取和来源 hash 改变被拒绝。
- 排队后文案发生变化时明确失败，禁止静默换输入；空正文不能采纳，也不能伪造成功。
- 在 enqueue 返回前强制 recovery claim，仍能接上先落库的 transform 和冻结文案，不因抢跑整单失败。
- 来源标题为空、超长或结构污染时仍能生成及采纳；名称遵守现有 Candidate 协议，来源原题保留在快照；不把来源标题伪装成 Project 核心信息。

前端新增 `use-topic-preview.test.tsx` 与 editor 用例验证：发送前保存幂等键；旧任务状态变化不能误清键；重开页面沿同键核对；明确找到原请求时仅恢复该任务；切作品后迟到响应不覆盖新作品；纯正文无标题可编辑复制，采纳带编辑正文，活动重试期间旧稿仍可复制。

## 本轮发现并修复

1. 内部协议拒绝 `positioningVersionId:null` 和显式 `strategy_backed`，导致合法请求进入错误路径。
2. Worker/filter、后端 union narrowing、检查点闭包及前端状态读取存在类型错误；前端漏导入状态函数会在实际轮询时异常。
3. 成功正文缺少采纳按钮；活动重试时旧稿的编辑/采纳状态未按最新任务关闭。
4. 未知请求以任意历史 transform 变化作为受理证明，可能丢失原键；改成精确请求键和来源快照匹配。
5. Candidate 提交与 transform 确认之间断线可能重复创建；改成按服务端 transform、用户及账号身份幂等回放，并取已保存正文。
6. 排队后文案未冻结、task 可先于 transform 被领取；改为 transform 先落库，任务带冻结输入和明确绑定，执行前校验。
7. 旧链 draft prompt 的拆解/选题/策略上下文补回，保持旧链消费这些证据；新主链不要求它们。
8. 无标题来源会因模板 requiredFacets 阻断正文；移除该必需项，采纳时做候选名称的协议归一化。

旧测试只在已确认行为变化时更新：生成按钮文案与取消确认弹窗、无定位可继续、失败提示，以及内部批量旧链显式 strategyBacked。Project DTO 测试改由内部可信 service 写入 evidence，同时验证公共 create/patch 不允许注入/替换 provenance。分享导入 fixture 补齐当前已有的 task receipt，仍检查真实返回后刷新。

## 复现命令

```bash
pnpm --filter @creatoros/backend exec vitest run src/modules/intelligence/rewrite-only.integration.test.ts src/modules/intelligence/intelligence.service.test.ts src/modules/intelligence/topic-preview-runner.test.ts src/modules/intelligence/project-reference.service.test.ts src/modules/intelligence/radar-project-queue.service.test.ts src/modules/intelligence/intelligence.contract.test.ts src/modules/intelligence/intelligence.db-schema.test.ts src/modules/candidate/candidate.service.test.ts src/modules/projects/projects.contract.test.ts src/modules/ai-runtime/creative-context.test.ts --maxWorkers=2 --retry=0
pnpm --filter creatoros-frontend exec vitest run src/features/intelligence/intelligence-workbench.test.tsx src/features/intelligence/topic-candidate-editor.test.tsx src/features/intelligence/use-topic-preview.test.tsx src/features/intelligence/intelligence-transcript-upload.test.ts src/server/intelligence-topic-preview-config.test.ts --maxWorkers=2 --retry=0
pnpm --filter @creatoros/ai-worker exec vitest run src/execution/intelligence-generation-worker.test.ts src/execution/intelligence-worker-bundle.test.ts src/prompt/templates/intelligence-topic-stages.test.ts --maxWorkers=2 --retry=0
pnpm --filter @creatoros/contract exec vitest run tests/intelligence-contract.test.ts --maxWorkers=2 --retry=0
pnpm --filter creatoros-frontend exec tsc --noEmit
pnpm --filter @creatoros/ai-worker exec tsc --noEmit
pnpm --filter @creatoros/contract exec tsc --noEmit
pnpm --filter @creatoros/backend exec tsc --project ../docs/verification/t1017-rewrite-first/backend-production.tsconfig.json
```

后端生产类型配置只排除测试文件。完整检查仍执行了并保留失败日志，不将排除旧测试的结果写成完整 backend tsc PASS。

## 全局未通过项及验收限制

- 完整后端 `tsc --noEmit`：旧 asset、chat、signal-quality、transcribe、copilot、legacy-script-patch 和 asset-worker 测试存在 API 漂移或类型错误；本轮最终改写代码及新增测试没有残余类型错误。原始输出见 `backend-full-typecheck.log`。
- `boundary-scan`：剩余 7 条、登记基线 5 条；两条未登记差异在未改动的 `frontend/src/features/copilot/live-chat-session.ts`，为 `ai` / `@ai-sdk/react` 引用。本轮新增测试的跨模块 repository import 已改用 Projects 公共入口，改写链不新增该违规。
- `semantic-boundary-scan`：未改动的 `video-decisions-runner.ts` 缺少 material.match Skill 调用。
- `orphan-scan`：0 error、100 warning。Research Gate 无未关闭项。
- `pmem sync` 已执行；全局 `reconcile` 退出 1，29 error、1 warning；包括既有评审回执漂移和教训门失败，原始结果见 `reconcile.log`。边界/语义/旧测试问题登记 T-1018，其余历史回执及教训对账沿既有 T-1015。
- 普通常规 `script.draft` 缺少 T-642 所要求的相似度采纳门，属于已有未完成任务 T-642。原有独立 `projectScriptCandidates.accept` 门继续保留；本任务没有移除它。缺项未获 accepted-risk，不作为本轮已通过证据。
- `product-to-code-orchestrator` 的前端/集成验收要求真实数据、真实桌面或浏览器旅程及可绑定的报告。本轮只有组件交互和本地模型协议贯通，没有真实供应商、最终安装包、双视口真人旅程或发布验证。因此 T-1017 保持进行中，验收仍待验。
