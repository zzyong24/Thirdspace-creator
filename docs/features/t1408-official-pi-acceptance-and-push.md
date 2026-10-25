# T-1408 官方 Pi 与未通过验收闭环后推送

2026-10-25，用户明确：“有问题就继续修复啊，把官方 Pi 的 402 和没通过的验收都处理好，复验通过后再推送。”本条更新 T-1407 的仅准备推送范围，授权修复、真实测试、本地打包安装、正常合并与非强制推送；不包含 tag、Release、生产放量、代充或伪造钱包。

## 用户结果与现状

官方来源 Pi 能在月明水清深真实账号组完成正常对话；真实余额/权益等拒绝必须查明权威原因，不能只改文案或换源当恢复。当前原任务 ai-task-5e73167d-401 为 http_402 / waiting_user，公开组级执行诊断错误要求平台账号；这也是需要查明的产品缺陷候选。

最终安装候选 6daaf，当前 main 8f0245a5a。保留既有六组合和新包两引擎三轮通过证据；65项目及5组成员不得损坏。当前 quick reconcile 22 ERROR/17 WARN、T1405/T1407缺标准UI旅程证据及旧UX失败逐项核查归属，以真实审核、修复和验收闭环，不删除门或把历史PASS移植到新规格。

## 执行与允许范围

先公开CLI回读原任务和当前配置元数据，同时检查开发源码，查明官方402发出方与安全错误信息丢失点。运行态只走公开CLI和正常用户界面；不读取用户数据库、密钥、连接文件，不通过任意平台账号绕过组权限。用户已指定月明水清深，不再询问测试分组。

初始写集为本SPEC、docs/verification/t1408/**、docs/research/2026-10-25-official-pi-and-acceptance-repair.md、BACKLOG.md、BACKLOG-archive.md与任务/审核/阶段/DEC正常控制面。产品改动先写清确切根因、最小路径、合同和红测，再独立审核后实施。

按原任务合法恢复路径执行新授权的失败恢复；未知结果只回读，不制造替代任务。若权威服务需要实际付款/真实资金管理，不凭本修复任务擅自调整；继续完成可做的产品修复与验收，并如实报告缺失条件。

## 验收与推送条件

- 官方Pi按原官方来源完成真实回复、跨轮记忆/计算和同组只读工具；不同来源/引擎合同、错误脱敏与权限有针对性回归。
- 补齐本次实际UI操作的标准旅程证据，终态、刷新/返回、恢复和配置保全均可回读；CLI证据不伪装UI证据。
- 22项对账错误逐项修复或依据既有规则重新独立评审，保持历史原证据；必要的真实失败回归通过后才能标完成，不手改状态或稀释验收。
- 相关backend/worker/frontend测试、串行6144MiB类型检查、LED047/053、boundary、安全扫描、适用full检查和独立代码/安装复核；固定入口在干净提交候选打包安装。
- 全部约定验收通过后，普通merge最新origin/main，保留其他工作树未提交内容；正常hooks非强推，推送后回读远端SHA。遇新冲突/失败继续在授权范围修复，不签假绿。

具体诊断和实施合同在本SPEC补充，SPEC+BACKLOG为唯一计划。

## FR-140801 组任务诊断的 CLI 入口一致性

已核实：`workbench-public.transport.ts` 已允许 inspect/events 在真实 groupId、accountId=null 下读取；`workbench-public.service.ts` 通过持久任务所有权与 workspaceFilter 限制用户/组。CLI invocation gateway 先依据 WORKSPACE_OPERATION_SCOPES 强制平台账号，因此合法纯组请求先被 428 拦截。最小修复仅将 `workbench.tasks.inspect`、`workbench.tasks.events` 声明改为 group；legacy account-only 仍按原账号解析，artifact/file 操作保持其原平台权限。不得扩大敏感字段或绕过 task owner 校验。

产品写集本轮仅 `contract/src/workspace-operation-scope.ts`；测试写集 `backend/src/modules/cli-invocations/cli-workbench-inspection.test.ts`。测试组合真实 invocation gateway、workbench transport/service、persistent tasks 与 stream service，隔离临时DB：纯组 inspect/events 返回原任务且分页正确；不存在任务、异用户、异组均拒绝；legacy账号读保留；归档组只读可用；artifact/file纯组仍拒绝；敏感payload/fence不输出。先在旧声明跑红测，再改声明跑绿，不把直调service当CLI覆盖。

此项只修复诊断入口，不能据此声称官方402恢复；402根因及验收控制面迁移在后续新增合同/独评后实施。

### FR-140801 独审修订

既有 `backend/src/integration/group-workbench-capabilities.integration.test.ts` 的T1317断言仍要求两个CLI诊断入口拒绝纯组，与本次修复目标冲突。将该文件加入测试写集：两项改为经真实gateway成功读取与成功审计，保留异组/异用户/缺任务/归档只读/legacy及所有文件平台权限负向。相关回归包含该文件、新诊断组合测试、cli-invocations.service.test.ts、workbench-public.test.ts；这是修正旧行为契约，不能删除负向边界来过测。
