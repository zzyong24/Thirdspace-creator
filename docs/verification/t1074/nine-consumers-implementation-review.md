# T-1074 九文件独立实现复查

PASS，仅用户已审§8.1四项九文件及必要原消费者的当前实现复查。未见未解决范围内阻断；三项本轮发现均有修正/复验，真实公共59含三项PG竞态、当前前端67、LED047167及最新前端/contract/MCP类型通过。backend整体类型仍为原2历史错误，保持FAIL。Intelligence post-change原ipc/doc预算机械核验通过，旧源证据保留。

复查范围：`contract/src/workspace-operation-scope.ts`、`frontend/src/features/draft-workbench/draft-chat-request.tsx`、`frontend/src/features/draft-workbench/draft-chat-request.test.tsx`、`frontend/src/features/copilot/chat-work-editor-card.tsx`、`frontend/src/features/copilot/chat-work-editor-card.test.tsx`、`backend/src/modules/candidate/candidate.service.ts`、`backend/src/modules/candidate/candidate.service.test.ts`、`backend/src/modules/intelligence/intelligence.service.ts`、`backend/src/modules/intelligence/intelligence.service.test.ts`；必要原消费者 `assistant-system-root.ts` / `chat-system-action-card.tsx`。只读支持源及当前SHA详见JSON。

## 当前结论

- **T1074-CONSUMER-SCOPE：PASS。** 四API均登记group，除4新增键之外原作用域穷举不变；不引入新API或权限。 依据：`contract/src/workspace-operation-scope.ts:27–30`。
- **T1074-EDITOR-ADOPTION：PASS。** 按稳定requestId绑定候选canonical与本次保存Promise，finally释放；旧adoptCandidate(candidate,requestId)不变。无匹配编辑器调用source-only正式API；匹配编辑器dirty抛typed冲突、不用null fallback，入口换页/等待期间generation或dirty变化保留saved-not-synced。来源scope与观察基版本核验，精确版本/当前版本读回匹配；card先读原receipt，input.receipt恢复不再次adopt；读取失败只保留原结果/未知状态和恢复入口。原两工作台文件未改，保留其local草稿/generation/currentMatches及刷新机制。 依据：`draft-chat-request.tsx:54–72/340–362；chat-work-editor-card.tsx:36–94；chat-system-action-card.tsx:168–190`。
- **T1074-CANDIDATE-LOCK：PASS。** rollback真实tx能力守卫、user/workspace/id scoped SELECT FOR UPDATE、原DTO；root锁读比较后调用原promote，同store项目peer及receipt同行提交。实际PG两连接覆盖编辑先锁/采用先锁两种次序，数据库pg_stat_activity确认Lock；receipt INSERT失败同行回滚。 依据：`candidate.service.ts:572–582；assistant-system-root.ts:150–152；persistence-client.ts:6648–6663`。
- **T1074-RADAR-PURE-READ：PASS。** readCollection不调用getWorkspace，按user/workspace/id/non-archived纯SELECT；有锁选项限实际事务。无parent prepare直接返回null、有parent采用先FOR UPDATE重读原DTO/version比较后仍原createCollection。实际PG第二连接由原deleteCollection持锁，公共采用等锁后拒绝，无孤儿/receipt；原createCollection拒绝归档父项。 依据：`intelligence.service.ts:2407–2418/2537–2540；assistant-system-root.ts:100–103/166–169`。

## 保留发现与修正

- **IMPL-001 / resolved**：新增冻结编辑器公共夹具对workState联合直接访问document.title，导致原2项历史类型红之外新增TS2339。 改为实际document.toMatchObject({title:expect.stringMatching(...)})，保持原结果与标题断言；最终backend类型日志中新增错误已消失，仅保留原2历史项。 证据：`nine-backend-types-final`、`nine-backend-types-rechecked`。
- **IMPL-002 / resolved**：本地EditorCandidateConflictError经过通用humanize可能丢失脏稿恢复指引，实际RED未读到明确未保存提示。 仅typed本地冲突显示其已审中文message；其它供应商/服务错误继续humanize。当前67回归含未保存输入保留且source adopt/旧save调用为0。 证据：`editor-dirty-message-red`、`editor-source-bridge-final`、`editor-adoption-ui-final`。
- **IMPL-003 / resolved**：正式采用后静态impact占位“等待你采用”与已采用状态冲突。 无真实impact时返回空文本并不画占位p；真实日期、账号、素材计数与生成信息保持。当前完整source采用回归只发来源引用、保留两参数编辑器调用、精确版本读回并断言无重复等待文案。 证据：`editor-adopted-status-red`、`editor-adoption-ui-final`。

## 已核对验证

|证据|真实结果|
|---|---|
|nine-public-full-pg-fixed|exit 0；59 passed (59)|
|editor-source-bridge-current|exit 0；65 passed (65)|
|editor-source-bridge-final|exit 0；66 passed (66)|
|editor-adoption-ui-final|exit 0；67 passed (67)|
|nine-led047-current|exit 0；167 passed (167)|
|nine-frontend-types-final|exit 0|
|nine-frontend-types-rechecked|exit 0|
|nine-backend-types-final|exit 2|
|nine-backend-types-rechecked|exit 2|
|nine-supplement-backend-types|exit 2|
|editor-dirty-message-red|exit 1；1 ⎯⎯⎯⎯⎯⎯⎯|
|editor-adopted-status-red|exit 1；1 ⎯⎯⎯⎯⎯⎯⎯|
|nine-editor-owner-fixture-fixed|exit 0；2 passed ／ 57 skipped (59)|
|editor-adoption-types-final|exit 0|
|scope-contract-mcp-types|exit 0|

追加最新类型证据：`editor-adoption-types-final` exit0；`scope-contract-mcp-types` 两包类型exit0，日志sha已与metadata核对。

所有上述日志sha与metadata.logSHA256核对一致。`nine-backend-types-final`的新增TS2339原3红日志保留；`nine-backend-types-rechecked`仅原2红，日志sha与`nine-supplement-backend-types`相同。`editor-dirty-message-red`与`editor-adopted-status-red`保留，最终`editor-adoption-ui-final`67通过。PG测试三个runIf均计入59passed且无skip，源码使用独立第二Pool并查询pg_stat_activity Lock，不把PGlite顺序当并发。

## Intelligence 当前机械预算

当前SHA：`3656cf91333147c2372c4d1ae9978d78cddffc3c980dfdb07a21c74703d88b81`；旧补充前SHA：`4ca8c1db2e5962c3a5c0f586d7fa2a2681774336f849d46d6a9f63dc96a25033`。现行marker分类与HEAD同为`ipc`；新增diff是分类纯读/事务锁读及归档父项保护，IPC说明原文仍HEAD同文，无新IPC/常驻程序/凭据/工具链/执行权。旧证据[complexity-source.json](/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1074-nine-review/complexity-source.json)保持不动；此处仅供当前精确源sha的原预算重绑。

## 当前源码SHA

|文件|SHA256|
|---|---|
|contract/src/workspace-operation-scope.ts|78fa7765a98a34e966818275cc21dff1a6895f7734e4f3224b9670215307d0b3|
|frontend/src/features/draft-workbench/draft-chat-request.tsx|9d36e3049aa4c85222c28e1a46af2c8df5ef585a5faa2ecedb0690ea8ffa16c1|
|frontend/src/features/draft-workbench/draft-chat-request.test.tsx|4700d008edc41e2fce74c9ba64a96445ec0e5e30d1c805523a5714dfc6821533|
|frontend/src/features/copilot/chat-work-editor-card.tsx|1af168c089aecc67a4251217d96869c7c5de5610dae23a5d708eb40ed6ba8015|
|frontend/src/features/copilot/chat-work-editor-card.test.tsx|e2ec73e05ed1ab32950112942a96840b5268f0f7b76977fed8f4b87ce2ef341d|
|backend/src/modules/candidate/candidate.service.ts|0cb3fa786a34dff34404959dfe7cd5b079d15c2755dbe4896273a4dbee5e63de|
|backend/src/modules/candidate/candidate.service.test.ts|65d4f558469103947fce4555a674b446f65481a752e544e029e748b37ea3ce72|
|backend/src/modules/intelligence/intelligence.service.ts|3656cf91333147c2372c4d1ae9978d78cddffc3c980dfdb07a21c74703d88b81|
|backend/src/modules/intelligence/intelligence.service.test.ts|c098208a35ec355ac63e9f12c9123474676c40c9dd6a815fab6f5a27fa25ff8b|
|backend/src/application/chat/assistant-system-root.ts|8e4a0feeecffcef327b08f5e690f407495e43826e234320d2f3cffc24834e0e2|
|frontend/src/features/copilot/chat-system-action-card.tsx|d9c8e71635cd78ffb7ca4fd22e4dcff7dc96745dec49475846176619f0ba4445|
|backend/src/application/chat/assistant-system-root.integration.test.ts|0246b5561f67c64a54d065058a267db18d1be957a312a7d78f37bd351170eb86|
|frontend/src/features/copilot/chat-system-action-card.test.tsx|97228356b424756c032fa603fd736b56d719ae6064a2c07fa73b2cee11432d0e|
|frontend/src/features/article/article-workbench.tsx|8f3468697be11eba8c1b29896ea7ee10dbb92c6a3934d241ebad86289e1f33e3|
|frontend/src/features/projects/graphic-post-workbench.tsx|92df2885de532884614bdefc3b50215f50759ba0f48118c5ec5d2f7ef2da3448|
|frontend/src/server/persistence-client.ts|4fdb19a2268a5faad298b67173193642098ddac7968d17f093377d8ef322e4f7|
|backend/src/modules/ai/assistant-action-adoption.service.ts|a8594a7625e32594bf9492078eab08d64d8a73cef23bb36511306edf3fd31585|

## 验证范围限制

- 仅§8.1九文件及必要原消费者有界独立实现复查；不是新SPEC轮次，不修改SPEC/review-event/控制面。
- 本会话未重跑大量产品测试；只读核对既有真实执行metadata、日志sha/结果和相应当前源码，另实际git diff --check通过。
- 公共59通过含三项真实PG两连接竞态；不扩大为所有PG场景、模型或系统全功能通过。
- 当前67前端回归/167 LED047、最新前端/contract/MCP类型通过；backend整体类型仍exit2且仅2条原历史错误，其日志与补充前原2红记录sha完全相同，不声称backend整体类型PASS。
- 同模型独立会话是弱门；未独立操作实际UI或给视觉评分，未签真实模型、安装包、发布或T-1074整任务完成。
- Intelligence机械预算只绑定当前源sha/原ipc分类；旧pre-supplement记录原样保留，未修改预算ledger或progress授权。

主会话另提供隔离typed API fixture UI观察：1366未保存时无写入；1024在1.5秒保存等待内继续填写新稿后为saved-not-synced，原输入/焦点保留，正式source采用仅一次、精确版本读回且旧createVersion未调用。本复查者未独立操作这两次UI，不代签backend/model/native或视觉评分。
