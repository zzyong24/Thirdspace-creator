# f9e5e5ece 安装版 CLI 矩阵独立只读复核

> 接手说明：本轮只追加证据可得性备注；原结论和哈希仍指原验收时版本，不代表本机重跑。原文保留于提交 c8589fe7f。原件所在电脑依用户接手规划说明，本轮只核对本仓库。


2026-10-25，审核者 `/root/t1426_spec_review`。已读 T-1427 任务包 §1–5、7–9及写入前的§6、当前SPEC，重新读取 RESULT、functional-results、matrix、每轮 submit/messages/task/events 原始回执、路由及新旧官方任务回执。未执行 CLI、模型、UI、测试或用户数据读写；唯一写入为本报告。安装身份引用相邻 independent-install-review.md 对 `f9e5e5ece06d7d86dbb5bd38db76d18cc2437d84` 的独立产物核验，本次未再计算安装包哈希，不把后续控制面提交视为新构建。

结论：四组支持的设置/引擎组合各三轮共12次功能通过；一组正确拒绝；官方Pi仍失败，六组合不能记全绿。摘要与原始消息、任务和事件能对应，未见以成功状态冒充空回复的情况。evidence-index.json 登记的229份文件逐项重算字节数和SHA-256，全部吻合；本报告是索引生成后的新审核文件，不要求倒填进原索引。

| 设置来源 / 引擎 | 本轮独立核实 | 各轮观察墙钟秒 |
|---|---|---|
| codex / codex | 三轮通过 | 39.604 / 40.760 / 35.163 |
| official / codex | 三轮通过 | 45.464 / 29.879 / 39.942 |
| self / pi | 三轮通过，第三轮表达偏长 | 24.360 / 33.296 / 39.072 |
| self / codex | 三轮通过 | 44.154 / 37.859 / 39.979 |
| codex / pi | HTTP409合同拒绝，未创建任务 | 不作成功耗时 |
| official / pi | 首轮402、waiting_user，无正常assistant回复；后两轮未执行 | 130.886 |

四组三轮均按 submission 的 sourceMessageId 与 chatTaskId 找到且仅找到一份对应assistant回复，任务的status/runtimeStatus均为succeeded，completeness=completed，actualEngine分别为codex或pi。首轮确实输出中文正文及“月光731”；第二轮严格为“月光731｜323”，而不是只看任务状态。前两轮没有工具parts或工具输入事件。第三轮均只有一次 `system.read` / Pi规范名 `system_read`，消息parts和完整events相互吻合；request严格为 `accountGroups.get`，params只取当前对话组 `grp_legacy_acct-ae1a8346-9`，未全量列组或猜组。Codex输入附带既有默认limit=20/offset=0，Pi未显式携带这两个默认字段；没有其它输入。结果真实id和name分别对应该组与“月明水清深”，`__creatorosOutcome.status=ok`、sideEffect=none、error=null；每轮事件页hasMore=false。未见模型重问用户选择测试组或执行创建、采纳、发布工具。

主要原始回执位于 cli-retest/receipts/：codex+codex的messages编号0017/0030/0043、events0021/0034/0047；official+codex的messages0087/0100/0113、events0091/0104/0117；self+Pi的messages0134/0147/0160、events0138/0151/0164；self+codex的messages0177/0190/0203、events0181/0194/0207。逐轮ai.tasks.get原件均与matrix.task一致，原始messages及events数组也与matrix逐项一致，不只采信functionalAssertionsPassed标记。 【2026-10-28 接手补注：原始日志和截图在朱志勇机器上，未入库。】

Codex+Pi的0053提交回执是CLI exit4、HTTP_409，明确提示当前来源Codex不能由Pi执行；matrix.taskId=null。这证明合同边界拒绝有效，不能归为成功支持，也不能由测试对话已创建推断存在模型任务。

官方Pi：0068任务回读为ai-task-c34e9921-536 / execution-task-c34e9921-537，runtimeStatus=waiting_user、CHANNEL_MODEL_PAYMENT_REQUIRED；执行inspect的new-official-task.json为blocked、attempt1/max3。消息回读只有测试用户输入，没有正常assistant正文。原调用call_26b266f8-ef98-4b79-9ff3-4cddfdb8f076为rejected，rejectionCode=null。调用记录createdAt=10:02:36.491Z、updatedAt=10:02:41.222Z，差4.731秒；这两字段是账本创建至拒绝更新窗口，公开inspect未给startedAt，modelCalls.summary.calls亦为空，不能进一步认定为精确上游网络或生成耗时。RESULT中的“开始”宜按这一证据边界理解。0066-wait回执自身耗120.960秒、exit2，明确“超过120秒，后台任务没有被取消”；130.886秒是提交、该观察等待及回读的总墙钟。不能将两种时间混用，也不能因driver完成或文案准确而说402已修复，更无权归因为余额不足。真实业务原因与正常官方Pi对话仍未解决。

原任务保护：protected-original-task.json仍为execution-task-5e73167d-402、blocked/waiting_user、attempt2/max3、http_402、updatedAt=05:44:28.323Z，与本轮前 original-execution-after-resume.json 的id/status/runtimeStatus/attempt/maxAttempts/updatedAt/errorCode完全相同。两次原rejected调用的更新时间均早于本轮测试；没有第三调用。本轮所有公开call回执未见针对该原任务的写操作，矩阵只使用新专用对话；未消耗最后一次恢复。

配置恢复：原revision66到最终69，三次settings.modelRouting.put分别expectedRevision66→official、67→self、68→codex，均exit0/ok=true并公开回读。最终choices、effectiveChoices和legacyExecutionEngine与最初一致；revision递增不等于恢复失败。这里证明的是这些已记录路由字段恢复，不扩称所有设置或全部用户数据字节一致。

可用性与未验边界：self+Pi第三轮虽然名称和依据正确，但正文带内部组ID及5名成员的平台/昵称信息，明显比“名称并简述依据”冗长；保留该体验不足，功能通过不等于表达完美。三个Codex引擎来源行仅证明相应设置/引擎组合可执行，actualEngine=codex不证明底层实际请求了official或self所配置供应商；公开模型summary没有可支撑这种归因的信息。本轮仅每组合3轮，墙钟含CLI观察和回读，不能代签首字延迟、P50/P95、长会话或全模型可用。driver.log记录至最后self+codex第三轮，路由恢复原件完整；本目录未另列driver外层起止/退出收据，主会话报告的自然exit0仍只代表观察脚本完成，不是六组合验收结论。

没有新安装版UI旅程操作或frontend-validation证据，不能用本CLI记录代签；安装独审也只核安装身份与其数据摘要。额度页仅按用户明确跳过，不扩为官方聊天通过。T-1412 full在本轮审核时仍由主线程运行，本报告不预测其终态；T-1427完整验收、推送和发布均不由本报告批准。

证据绑定（均相对本报告目录）： 【2026-10-28 接手补注：下表 functional-results.json、cli-retest/ 下的文件、protected-original-task.json、new-official-task.json、evidence-index.json、driver.log 未入库；RESULT.md 与 independent-install-review.md 已入库。原始日志和截图在朱志勇机器上，未入库。】

| 文件 | SHA-256 |
|---|---|
| `RESULT.md` | `15a07885a97eb9f95b7be3ba6250090c29604d15dbe697054b9ba8834531cb81` |
| `functional-results.json` | `782d27d5b21ab97efbdae0997a0a3d567184e31e1e9a5f831f0f448e0f04ccdf` |
| `cli-retest/matrix.json` | `2acdfdc498a2ccd3c11d4024f5a014f66c52afd529f6323d42c70c6b86399629` |
| `cli-retest/route-restoration.json` | `064371795e9d7c674f715bf9fc419989f95fc07b053dcfc1448d54b989b499bd` |
| `protected-original-task.json` | `6c3011c3501c53791884e7cfcac44f58392e87a02f7878ea1498449ca40a581c` |
| `new-official-task.json` | `c8f6f8b0e0c530f3b745f9b075d968a4c2e702b78ff5a7b9481efafb46b7d48d` |
| `evidence-index.json` | `4b9e5c30b7cfeba180d05cdd43d5615b0374e1bcd2722e2661ea242272bd3550` |
| `independent-install-review.md` | `376d469508b97b27020af5d3b635f19d37d7d4c189c0917a9c0cb7b13b1906de` |
| `driver.log` | `dcffac3f18be50ee2a0c3897776ff7dfb9d9f077f69f3b845dd0f5d652da566a` |
