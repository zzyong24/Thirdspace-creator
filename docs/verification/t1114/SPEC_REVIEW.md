# T-1114 独立 SPEC 初审（最终 initial）

- 评审时间：`2026-10-09T07:41:44.207637+00:00`
- 结论：**PASS**
- SPEC：`EVIDENCE-SHA256:4099eec59cd87db242acc198e4748dfe6f61673dae2308383000f44001caa103:docs/features/t1114-owned-model-call-summary.md`
- modules：`EVIDENCE-SHA256:af5c6b91f2ef526ab5dbd8fbda55a816cfb37c1be8bcee4782c1bf2fa20ea073:orchestrator/process/modules.config.json`
- 产品定位：`EVIDENCE-SHA256:86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800:docs/产品定位.md`
- 架构：`EVIDENCE-SHA256:eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df:orchestrator/SYSTEM_ARCHITECTURE.md`

## 结论

T-1114 是 T1103 取证所需的最小公共只读合同。它新增独立 `workbench.modelCalls.summary`，没有复用会返回有界 `inputText` 的 inspect DTO，也没有改 parser、模型、Worker、SDK、数据库、预算、执行或采用语义。入口不加入模型工具目录，只能从公开 executionTaskId 经 CLI 审计调用。

归属闭包可执行：先使用 `persistentTask.get` 的 `userId + workspaceFilter`，再核 execution、AI task、冻结 modelInput、conversation、source message及冻结history双向关系。纯组、旧账号、归档历史均有成功族；异用户、异组、异账号、无身份或无workspace均拒绝，不造账号、不取得lease。

## 旧来源兼容复核

当前SPEC新增规则与 `0130_legacy_source_ownership.sql` 一致。0130只锁定并回填 `ai_conversations`、article/graphic anchors；没有改 `execution_tasks`、`ai_tasks` 或冻结 `modelInput`。会话只有在账号仍处于唯一version=1的 `grp_legacy_<accountId>` 初始成员关系且父链一致时才被盖章，不能迁到任意当前组。

因此原 `groupId=NULL + accountId` 的任务必须继续按NULL冻结核 execution/AI/modelInput。读取来源会话时，原legacy `workspaceFilter`只允许同账号的NULL或精确 `grp_legacy_<accountId>`，正好覆盖0130的合法回填；不能因为字符串看似canonical而改签任务冻结。完全canonical任务则要求execution、AI、modelInput、conversation全部同canonical。SPEC要求的NULL冻结+canonical来源、完全canonical及错配拒绝三族足以防止放宽。

`readChatTurnSnapshot` 对已绑定源消息按原 `historyMessageIds` 选择冻结历史，后续会话消息不会天然使历史任务失效；原payload、history/modelInput digest保持不变。

## DTO、grammar 与隐私

分析规则与当前receipt grammar一致：只有同model、同toolCallId、唯一start/end、顺序闭合、至少一个delta及唯一final identity时才拼接；只对两边严格JSON对象做深值比较。晚身份、无delta、Responses最终替换、Anthropic初始object、重复/越序/冲突保持机械unknown，不推断供应商raw wire、业务schema或候选成功。

DTO不含toolName、key、值、digest、正文、headers、token、warnings、providerMetadata或未知JSON。无效receipt固定 `finishReason=null`、`toolCount=null`、`toolsTruncated=null`、`tools=[]`，不宽松遍历未知数据。分页、100工具上限和truncated含义明确。

## 范围与验收

六生产/四测试路径与modules一致。公共PGlite须走chat submission→持久任务→CLI gateway→transport→service，并验证纯组task272、归档、旧账号、旧NULL冻结与0130来源、完全canonical、跨scope拒绝、多model分页、parent/nonsettled排除和原七门。允许原CLI读取审计及加密缓存，业务task/call/AI task/conversation/message/result须逐字不变。

安装验收只允许读取原task272并对照既有对象；不能重发模型、采用候选或把摘要equal称为供应商原字节完整。完成T-1114不代表T1103等任务完成，范围外41项失败继续保留。

## 审计说明

首版packet（MD SHA `1ba1a1f9762eccd2ee52e4dec288dcc6e8071a925afd8074f1af9c3d528c0d16`，JSON SHA `4ac15561404e0cb34c6d238fb265ebc84154addd0c746b980eec0a6932b4f5a0`）在record前生成，未形成review事件。当前文件是绑定新SPEC字节的最终initial；没有伪造recheck或历史finding。

## Findings

无未解决finding。
