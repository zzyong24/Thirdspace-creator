# T-1406 B：I02 规则归属与 I06 蒸馏采纳

已按独立评审通过的 SPEC `[REV:b3a0d1e8ff5d]` 实施。以下均为本源码及隔离测试结果，不能替代新安装版 Windows 实机验收。测试未调用模型供应商、真实平台或原安装数据库。

## 行为及兼容边界

I02：新建自定义规则必须明确当前真实账号组。列表、改删属主门及 L1 实际 active 词表同时纳入组归属；审核准备使用任务冻结的组。种子与无组历史记录保留共享层，DTO 明确 `system` / `shared_legacy` / `group`、`groupId`、`scopeDescription`。历史 NULL 不猜归属，不批量回填、不克隆、不停用。共享记录改删必须明确传 `confirmSharedImpact=true`，错误与契约字段均说明全组影响；此标志不能越权其他用户或组。现无规则 CRUD 页面，未伪造新管理入口，现有审核卡补充范围说明。

I06：新增 `knowledge.distill.receipt` 只读操作与原生幂等 `knowledge.distill.adopt`。AI 公共 source service 从真实冻结会话、任务及调用账本核对来源；存档原文只用实际工具输入与服务端输出。知识模块通过注入端口消费已验证来源，在同一事务先预留唯一批次回执，再写选中原子、首版、可选原文和最终回执。第一次选中的子集及存档选择固定，后续编辑/重试回读同一结果。组件刷新先恢复回执，响应丢失先一次回读；换组或来源改变拒绝旧异步结果。无来源旧卡明确禁采纳，需等待保存或重新蒸馏。普通手工创建仍允许同名同文的不同记录。

搜索索引和主题标签保留为提交后增强：使用原请求范围、真实建议标签和回执知识 ID；失败不能回滚业务回执，重试也不能再建一批。既有历史重复记录不自动删除或合并。

## 真实红测与最终回归

证据目录：`work/creatoros-eight-defects-fix-20261025/`。

| 检查 | 实际结果 | 证据 |
|---|---|---|
| I02 实施前真实断言 | 3/3 失败，证明跨组私有规则与旧共享确认缺口 | `b-red-review-confirmed.log` |
| I06 实施前同卡重挂载 | 失败，刷新不能恢复采纳事实 | `b-red-distill-repeat.log` |
| 本模块新旧 backend 回归 | 6 文件、41/41 通过 | `b-backend-final.log` |
| 组件回归（含最终 keyed-session 调整） | 4 文件、28/28 通过 | `b-final-keyed-components-recheck.log` |
| 本次4个前端文件限定 lint | 0错误0警告 | `b-final-newcode-eslint-clean.log` |
| 全契约与真实独立进程入口 | 88 文件、567/567 通过 | `b-contract-escalated.log` |
| 既有四谱系双启和 canonical 身份 | 5/5 通过，本次筛选外 23 例未运行 | `b-migration-lineages.log` |
| Backend TypeScript | 通过 | `b-typecheck-backend-recheck.log` |
| 限定已改路径 diff 空白检查 | 通过，只有 LF/CRLF 提示 | 本轮命令记录 |

backend 包括正式 transport/createClient，真实 Pi 工具领取/结算，以及现役 `worker.structured-node` 的父工具、子模型准备/预留/结算、服务端 complete 和采纳回读。供应商返回为受控夹具，没有网络模型请求。并发双击只得同一批回执；注入中途异常时原子、首版及回执一起回滚；跨组、伪造工具、unknown、篡改原文及冻结输入均拒绝。后端旧规则 service/contract/seed 用例已保留并将写入夹具绑定真实测试组；没有生产中“缺组猜当前组”的降级。

## 迁移保护

0141 只为 `review_rules` 增加 nullable `group_id` 和索引，没有 UPDATE 旧记录。SQL SHA-256：`369bab227e661865bd2b855ce3d67c788c1a80531eea144e1df93b5458807416`。canonical journal 115 条，SHA-256：`125740a03cb23f7d76f25a5de77fd7b0dc11cfb3f1b7a4a3a644a1f5ed523fc0`。原 114 条身份保留；冻结 root lineage 恢复 Git 基线原字节并检查无差异。严格 convergence 追加固定身份、0140 先决、SQL 校验、顺序尾迁移和终态真实回执要求，没有降低守卫。

独立 `review-rule-group-migration.test.ts` 从冻结旧 root 库开始，插入 manual/retro/seed 三种旧规则，用真实 public createDb 升级并双启。旧 ID、内容、status、时间逐字段一致，新 `group_id` 均为 NULL；真实0141回执存在，没有停用、克隆或猜归属。

## 必须保留的测试解释

首次外部 host 夹具被现役 Codex 目录正确拒绝，不能据此声称外部 host 通过；正向覆盖改为实际 Pi host 和现役 structured worker。安全旧证据中的六原子/100字原文/额外 outcome 元数据只做格式核对，未操作已安装旧卡。

初次 contract bootstrap 的 `uv_os_get_passwd ENOMEM` 经 root 的最小对照证实为 Windows 沙箱用户信息权限限制，不能归因为已证实内存不足；提权后完整567例通过，没有 mock os 或放宽校验。早期夹具 import、JSON Schema marker 和 React 异步等待错误均保留日志，不能当产品缺陷或真实红测。原安装库、密钥、UI、真实模型及平台均未操作。生产 PostgreSQL 真并发、断电恢复和新安装包实机复验仍须独立执行。

最终限定 lint 实际发现新增测试 any、同步 effect reset 与三条依赖 warning。已用正式 execution schema、`LintFinding`、`ComponentProps` 清理3个新增测试；确认门按稳定来源/组 epoch 重新挂载会话状态，effect 只同步外部回执，保留即时取消与迟到回执保护，没有关闭规则。4文件 lint 0错误0警告，同一28组件用例重跑通过，不累计为56。一次误猜 Vitest store 路径在测试前失败，随后缓存 pnpm 正式运行通过；前者仅为 harness 失败。该 hook 调整后的根统一 type/build 仍按根最新证据确认，不以此前构建冒称最终构建。

## 实际文件边界

- schema/migration：`backend/src/schema/review-gate.ts`、`backend/drizzle/0141_review_rule_group_scope.sql`、canonical journal、`backend/src/migration-convergence.ts` 及相关隔离迁移测试。
- rule owner：`backend/src/modules/review/review-gate.{repository,schema,service,transport}.ts`、seed 和该模块测试；契约 `review-gate` resource/operations；现有 `script-review-gate.tsx` 范围说明。
- distill owner：`backend/src/modules/ai/knowledge-distill-source.service.ts` 及测试/公共导出；`backend/src/modules/knowledge/knowledge-distill-adoption.service.ts`、transport/公共导出；`backend/src/application/knowledge.ts` 与 `frontend/src/server/persistence-client.ts` 的最小装配、派生索引/标签调用。
- client/contract：knowledge-distill resource、knowledge operations、CLI effect/native-idempotency、workspace scope、registry/bootstrap/新增契约测试；`ChatDistillCard`、`KnowledgeAtomGate`、`ai-copilot-content` 的 source 透传及组件测试。
